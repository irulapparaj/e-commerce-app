import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CustomerDetailDto } from '../../../src/modules/customers/detail.dto';
import { runDpdpExport } from '../../../src/modules/dpdp/export.job';
import { importDeps } from '../../../src/modules/imports/deps';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { readOtp, resetValkey, sendOtp, verifyOtp } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import {
  createCustomer,
  createOrderFor,
  CUSTOMER_LINE1,
  CUSTOMER_PHONE,
} from '../../helpers/customers';
import { getPrisma, getPrismaRaw, resetDb, seedMinimal } from '../../helpers/db';
import { IMPORTS_BUCKET } from '../../helpers/imports';
import { listQueuedJobs, resetJobs, waitForJob } from '../../helpers/jobs';

const REASON = 'Erasure request received by email on 2026-09-26';

const readAll = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
};

describe('customer disable/enable and DPDP export/erase', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;
  let categoryId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  it('disable revokes sessions and makes OTP login fail generically; enable restores', async () => {
    const customer = await createCustomer(testApp);

    const noStepUp = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/customers/${customer.id}/disable`,
      { reason: REASON },
    );
    const disabled = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/disable`,
      { reason: REASON },
    );
    const refresh = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: customer.session.refreshToken },
    });
    const { nonce } = await sendOtp(testApp, customer.email);
    const otp = await readOtp(testApp, customer.email);
    const login = await verifyOtp(testApp, customer.email, nonce, otp);
    const staffEnable = await adminInject(
      testApp,
      staff.token,
      'POST',
      `/admin/customers/${customer.id}/enable`,
    );
    const enabled = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/customers/${customer.id}/enable`,
    );
    const { nonce: nonce2 } = await sendOtp(testApp, customer.email);
    const loginAgain = await verifyOtp(
      testApp,
      customer.email,
      nonce2,
      await readOtp(testApp, customer.email),
    );
    const audits = await getPrisma().auditLog.findMany({
      where: { action: { in: ['customer.disabled', 'customer.enabled'] } },
      orderBy: { createdAt: 'asc' },
    });

    expect(noStepUp.statusCode).toBe(403);
    expect(disabled.statusCode).toBe(200);
    expect(body<{ customer: CustomerDetailDto }>(disabled).data.customer).toMatchObject({
      isDisabled: true,
      sessions: { count: 0 },
    });
    expect(refresh.statusCode).toBe(401);
    expect(login.statusCode).toBe(401);
    expect(body(login).error?.code).toBe('INVALID_OTP');
    expect(staffEnable.statusCode).toBe(403);
    expect(enabled.statusCode).toBe(200);
    expect(body<{ customer: CustomerDetailDto }>(enabled).data.customer.isDisabled).toBe(false);
    expect(loginAgain.statusCode).toBe(200);
    expect(audits.map((row) => row.action)).toEqual(['customer.disabled', 'customer.enabled']);
    expect(audits[0]?.after).toMatchObject({ isDisabled: true, reason: REASON });
  });

  it('erase anonymises the person, scrubs order snapshots, keeps orders and is audited with the source', async () => {
    const customer = await createCustomer(testApp);
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    const delivered = await createOrderFor(customer.id, product.variants[0]!.id, 'DELIVERED');
    const prisma = getPrisma();
    await prisma.wishlistItem.create({
      data: { userId: customer.id, variantId: product.variants[0]!.id },
    });

    const asStaff = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );
    const erased = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );
    const again = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    const rawUser = await getPrismaRaw().user.findUniqueOrThrow({ where: { id: customer.id } });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: delivered.id },
      include: { items: true },
    });
    const detail = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers/${customer.id}`,
    );
    const refresh = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: customer.session.refreshToken },
    });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'customer.erased' } });

    expect(asStaff.statusCode).toBe(403);
    expect(erased.statusCode).toBe(200);
    expect(body<{ erasedAt: string; retained: { orders: number } }>(erased).data).toMatchObject({
      retained: { orders: 1 },
    });
    expect(again.statusCode).toBe(409);
    expect(user).toMatchObject({
      email: `deleted+${customer.id}@anon.invalid`,
      name: 'Deleted user',
      phone: null,
      isDisabled: true,
    });
    expect(user.deletedAt).not.toBeNull();
    expect(rawUser.phoneHmac).toBeNull();
    expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(0);
    expect(await prisma.wishlistItem.count({ where: { userId: customer.id } })).toBe(0);
    expect(order.shippingAddress).toEqual({ city: 'Chennai', state: 'TN', pincode: '600001' });
    expect(order.email).toBe(`deleted+${customer.id}@anon.invalid`);
    expect(order.phone).toBe('');
    expect(order.items).toHaveLength(1);
    expect(order.total).toBe(10_500);
    expect(body<CustomerDetailDto>(detail).data).toMatchObject({
      maskedName: 'D. user',
      deleted: true,
      addresses: [],
      flags: { deleted: true },
    });
    expect(detail.body).not.toContain(CUSTOMER_PHONE);
    expect(detail.body).not.toContain(CUSTOMER_LINE1);
    expect(refresh.statusCode).toBe(401);
    expect(audit?.after).toEqual({
      source: 'ADMIN',
      reason: REASON,
      retained: { orders: 1 },
      scrubbed: { webhookEvents: 0 },
    });
  });

  it('erase scrubs stored webhook payloads that reference the customer payments (C-4)', async () => {
    const customer = await createCustomer(testApp);
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    const delivered = await createOrderFor(customer.id, product.variants[0]!.id, 'DELIVERED');
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: delivered.id },
      data: { razorpayOrderId: 'order_dpdp_1', razorpayPaymentId: 'pay_dpdp_1' },
    });
    // A row written before sanitize-at-write existed — still carrying raw PII
    await prisma.webhookEvent.create({
      data: {
        provider: 'RAZORPAY',
        externalId: 'evt_dpdp_1',
        signatureValid: true,
        payload: {
          id: 'evt_dpdp_1',
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_dpdp_1',
                order_id: 'order_dpdp_1',
                status: 'captured',
                amount: 10_500,
                email: 'buyer@example.test',
                contact: CUSTOMER_PHONE,
              },
            },
          },
        },
      },
    });

    const erased = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );
    expect(erased.statusCode).toBe(200);

    const row = await prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: 'evt_dpdp_1' } },
    });
    const stored = JSON.stringify(row.payload);
    expect(stored).not.toContain('buyer@example.test');
    expect(stored).not.toContain(CUSTOMER_PHONE);
    // Ids and amounts stay so financial reconciliation still works
    expect(stored).toContain('pay_dpdp_1');
    expect(stored).toContain('order_dpdp_1');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'customer.erased' } });
    expect(audit?.after).toMatchObject({ scrubbed: { webhookEvents: 1 } });
  });

  it('erase is blocked by an order in progress but not by a delivered one', async () => {
    const customer = await createCustomer(testApp);
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    const active = await createOrderFor(customer.id, product.variants[0]!.id, 'CONFIRMED');

    const blocked = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );
    const detail = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers/${customer.id}`,
    );
    await getPrisma().order.update({ where: { id: active.id }, data: { status: 'DELIVERED' } });
    const allowed = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/dpdp-erase`,
      { reason: REASON },
    );

    expect(blocked.statusCode).toBe(409);
    expect(body(blocked).error).toMatchObject({ code: 'ERASE_BLOCKED_ACTIVE_ORDERS' });
    expect((body(blocked).error as { details?: unknown }).details).toEqual({ activeOrders: 1 });
    expect(body<CustomerDetailDto>(detail).data.flags.activeOrders).toBe(1);
    expect(allowed.statusCode).toBe(200);
  });

  it('export writes the plaintext JSON, emails a presigned link and is queued through the route', async () => {
    const customer = await createCustomer(testApp);
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    await createOrderFor(customer.id, product.variants[0]!.id, 'DELIVERED');
    const deps = { ...importDeps(testApp.app), email: testApp.ports.email };

    const result = await runDpdpExport(deps, {
      userId: customer.id,
      requestedBy: 'ADMIN',
      actorId: admin.userId,
    });
    const json = JSON.parse(
      await readAll(
        await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: result.key }),
      ),
    ) as {
      version: number;
      profile: { email: string; phone: string | null };
      addresses: { line1: string }[];
      orders: { orderNumber: string; items: unknown[] }[];
      sessions: unknown[];
    };
    const mail = testApp.email?.lastTo(customer.email);
    const link = (/https?:\/\/\S+/.exec(mail?.text ?? '')?.[0] ?? '').replace(/[.)]+$/, '');
    const download = await fetch(link);
    const requested = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/customers/${customer.id}/dpdp-export`,
    );
    const asStaff = await adminInject(
      testApp,
      staff.token,
      'POST',
      `/admin/customers/${customer.id}/dpdp-export`,
    );
    const queued = await listQueuedJobs('dpdp-export');
    const audits = await getPrisma().auditLog.findMany({
      where: {
        action: { in: ['customer.dpdp_export_generated', 'customer.dpdp_export_requested'] },
      },
    });

    expect(result.key).toMatch(new RegExp(`^exports/dpdp/${customer.id}-[0-9a-f-]{36}\\.json$`));
    expect(json.version).toBe(1);
    expect(json.profile).toMatchObject({ email: customer.email, phone: CUSTOMER_PHONE });
    expect(json.addresses[0]?.line1).toBe(CUSTOMER_LINE1);
    expect(json.orders[0]?.items).toHaveLength(1);
    expect(json.sessions).toHaveLength(1);
    expect(mail?.subject).toContain('data export is ready');
    expect(link).toContain('X-Amz-Expires=900');
    expect(download.status).toBe(200);
    expect(requested.statusCode).toBe(202);
    expect(asStaff.statusCode).toBe(403);
    expect(queued.map((job) => job.data)).toEqual([
      { userId: customer.id, requestedBy: 'ADMIN', actorId: admin.userId },
    ]);
    expect(audits).toHaveLength(2);
  });

  it('the dpdp-export worker completes the queued job', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const customer = await createCustomer(testApp);
      const requested = await adminInject(
        testApp,
        admin.token,
        'POST',
        `/admin/customers/${customer.id}/dpdp-export`,
      );
      const job = await waitForJob(
        worker,
        'dpdp-export',
        body<{ jobId: string }>(requested).data.jobId,
      );

      expect(job.state).toBe('completed');
      expect(job.output).toMatchObject({ userId: customer.id, emailed: true });
    } finally {
      await worker.close();
    }
  });
});
