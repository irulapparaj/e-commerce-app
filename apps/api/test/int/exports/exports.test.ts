import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runRetention } from '../../../src/modules/dpdp/retention.job';
import { expireExports } from '../../../src/modules/exports/expire';
import { EXPORT_TTL_MS, runExportGenerate } from '../../../src/modules/exports/generate.job';
import { importDeps } from '../../../src/modules/imports/deps';
import { parseImportFile } from '../../../src/modules/imports/parse';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import {
  applyNow,
  importFixture,
  IMPORTS_BUCKET,
  uploadImport,
  validateNow,
} from '../../helpers/imports';
import { listQueuedJobs, resetJobs, waitForJob } from '../../helpers/jobs';

const readAll = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
};

const seedOrder = async (userId: string, variantId: string) =>
  getPrisma().order.create({
    data: {
      orderNumber: `PE-2026${String(Date.now()).slice(-4)}`,
      userId,
      email: 'buyer@example.test',
      phone: '9876543210',
      shippingAddress: {
        name: 'Buyer Person',
        phone: '9876543210',
        line1: '12 Temple Street',
        line2: 'Near tank',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
      },
      destinationState: 'TN',
      subtotal: 10_000,
      shippingAmount: 0,
      cgstAmount: 250,
      sgstAmount: 250,
      total: 10_500,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: {
        create: {
          variantId,
          productName: 'Thing',
          variantLabel: 'Std',
          sku: 'THING-V1',
          unitPrice: 10_000,
          quantity: 1,
          hsnCode: '3307',
          gstRate: 5,
        },
      },
    },
  });

describe('exports', () => {
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
    // MinIO is shared across test files; start each test without leftover export objects.
    await expireExports(importDeps(testApp.app), { now: new Date(), maxAgeMs: -60_000 });
  });

  it('products export round-trips through validation with zero errors and guards formulas', async () => {
    const { job } = await uploadImport(testApp, admin, importFixture('valid.csv'));
    await validateNow(testApp, job.id);
    await applyNow(testApp, job.id, admin);
    const deps = importDeps(testApp.app);

    const generated = await runExportGenerate(deps, {
      type: 'products',
      actorId: staff.userId,
      full: false,
    });
    const csv = await readAll(
      await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: generated.key }),
    );
    const { job: again } = await uploadImport(testApp, admin, Buffer.from(csv, 'utf8'));
    const revalidated = await validateNow(testApp, again.id);
    const parsed = await parseImportFile(Buffer.from(csv, 'utf8'), 'text/csv', { maxRows: 5000 });
    const dhoop = parsed.rows.find((row) => row.cells.sku === 'IMP-DH-003');

    expect(generated.type).toBe('products');
    expect(generated.rows).toBeGreaterThanOrEqual(6);
    expect(generated.key).toMatch(/^exports\/products-[0-9a-f-]{36}\.csv$/);
    expect(revalidated).toMatchObject({ status: 'VALIDATED', errorRows: 0 });
    expect(dhoop?.cells.description_text).toBe('\'=HYPERLINK("http://evil.example")');
    expect(csv).toContain('"IMP-AG-001-20","20 sticks","80.50","99.00","120"');
    expect(await getPrisma().auditLog.count({ where: { action: 'export.generated' } })).toBe(1);
  });

  it('orders export masks the phone and omits address lines unless full=true', async () => {
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    const buyer = await getPrisma().user.create({
      data: { email: 'buyer@example.test', phone: '9876543210' },
    });
    await seedOrder(buyer.id, product.variants[0]!.id);
    const deps = importDeps(testApp.app);

    const minimal = await runExportGenerate(deps, {
      type: 'orders',
      actorId: admin.userId,
      full: false,
    });
    const full = await runExportGenerate(deps, {
      type: 'orders',
      actorId: admin.userId,
      full: true,
    });
    const minimalCsv = await readAll(
      await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: minimal.key }),
    );
    const fullCsv = await readAll(
      await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: full.key }),
    );

    expect(minimal.rows).toBe(1);
    expect(minimalCsv).toContain('"98•••••210"');
    expect(minimalCsv).toContain('"Chennai","TN","600001"');
    expect(minimalCsv).not.toContain('Temple Street');
    expect(minimalCsv).not.toContain('9876543210');
    expect(minimalCsv).not.toContain('buyer@example.test');
    expect(minimalCsv).toContain('"THING-V1×1"');
    expect(fullCsv).toContain(
      '"buyer@example.test","Buyer Person","9876543210","12 Temple Street","Near tank"',
    );
  });

  it('customers export hashes emails and masks phones; full adds the clear values', async () => {
    await getPrisma().user.create({
      data: { email: 'c1@example.test', name: 'Cee One', phone: '9123456789' },
    });
    const deps = importDeps(testApp.app);

    const minimal = await runExportGenerate(deps, {
      type: 'customers',
      actorId: admin.userId,
      full: false,
    });
    const full = await runExportGenerate(deps, {
      type: 'customers',
      actorId: admin.userId,
      full: true,
    });
    const minimalCsv = await readAll(
      await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: minimal.key }),
    );
    const fullCsv = await readAll(
      await testApp.ports.storage.getStream({ bucket: IMPORTS_BUCKET, key: full.key }),
    );

    expect(minimal.rows).toBe(1);
    expect(minimalCsv).toMatch(/"[0-9a-f]{64}"/);
    expect(minimalCsv).toContain('"91•••••789"');
    expect(minimalCsv).not.toContain('c1@example.test');
    expect(minimalCsv).not.toContain('admin@example.test');
    expect(fullCsv).toContain('"c1@example.test","Cee One","9123456789"');
  });

  it('routes: STAFF may export products only, full exports need a reason, links are 15-minute presigned GETs', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const staffProducts = await adminInject(
        testApp,
        staff.token,
        'POST',
        '/admin/export/products',
      );
      const staffOrders = await adminInject(
        testApp,
        staff.steppedToken,
        'POST',
        '/admin/export/orders',
        { full: false },
      );
      const noStepUp = await adminInject(testApp, admin.token, 'POST', '/admin/export/customers', {
        full: false,
      });
      const noReason = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        '/admin/export/orders',
        { full: true },
      );
      const orders = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        '/admin/export/orders',
        {
          full: true,
          reason: 'GST audit request from CA',
        },
      );
      const productsId = body<{ exportId: string }>(staffProducts).data.exportId;
      const ordersId = body<{ exportId: string }>(orders).data.exportId;
      await waitForJob(worker, 'export-generate', productsId);
      await waitForJob(worker, 'export-generate', ordersId);
      const staffStatus = await adminInject(
        testApp,
        staff.token,
        'GET',
        `/admin/export/${productsId}`,
      );
      const staffPeek = await adminInject(testApp, staff.token, 'GET', `/admin/export/${ordersId}`);
      const adminStatus = await adminInject(
        testApp,
        admin.token,
        'GET',
        `/admin/export/${ordersId}`,
      );
      const missing = await adminInject(
        testApp,
        admin.token,
        'GET',
        `/admin/export/${randomUUID()}`,
      );
      const audits = await getPrisma().auditLog.findMany({
        where: { action: 'export.requested' },
        orderBy: { createdAt: 'asc' },
      });
      const status = body<{ state: string; url: string | null; type: string; expiresAt: string }>(
        staffStatus,
      ).data;
      const download = status.url === null ? null : await fetch(status.url);

      expect(staffProducts.statusCode).toBe(202);
      expect(staffOrders.statusCode).toBe(403);
      expect(noStepUp.statusCode).toBe(403);
      expect(body(noStepUp).error?.code).toBe('STEP_UP_REQUIRED');
      expect(noReason.statusCode).toBe(400);
      expect(orders.statusCode).toBe(202);
      expect(
        (await listQueuedJobs('export-generate')).map((row) => (row.data as { type: string }).type),
      ).toEqual(['products', 'orders']);
      expect(status).toMatchObject({ state: 'completed', type: 'products' });
      expect(status.url).toContain('X-Amz-Expires=900');
      expect(download?.status).toBe(200);
      expect(staffPeek.statusCode).toBe(404);
      expect(adminStatus.statusCode).toBe(200);
      expect(missing.statusCode).toBe(404);
      expect(audits.map((row) => row.after)).toEqual([
        { type: 'products', full: false },
        { type: 'orders', full: true, reason: 'GST audit request from CA' },
      ]);
    } finally {
      await worker.close();
    }
  });

  it('retention deletes export files older than 24 h and stale refresh tokens (clock injection)', async () => {
    const deps = importDeps(testApp.app);
    const fresh = await runExportGenerate(deps, {
      type: 'products',
      actorId: admin.userId,
      full: false,
    });
    const prisma = getPrisma();
    await prisma.refreshToken.create({
      data: {
        userId: admin.userId,
        familyId: randomUUID(),
        audience: 'STOREFRONT',
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      },
    });
    const liveSessions = await prisma.refreshToken.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });
    // Review fix C-4: webhook payloads age out after 90 days
    await prisma.webhookEvent.create({
      data: {
        provider: 'RAZORPAY',
        externalId: 'evt_retention_old',
        signatureValid: true,
        payload: { id: 'evt_retention_old', event: 'payment.captured' },
        createdAt: new Date(Date.now() - 91 * 24 * 3600 * 1000),
      },
    });
    await prisma.webhookEvent.create({
      data: {
        provider: 'RAZORPAY',
        externalId: 'evt_retention_fresh',
        signatureValid: true,
        payload: { id: 'evt_retention_fresh', event: 'payment.captured' },
      },
    });

    const kept = await expireExports(deps, { now: new Date() });
    const later = { ...deps, now: () => new Date(Date.now() + EXPORT_TTL_MS + 60_000) };
    const swept = await runRetention(later, { trigger: 'manual' });
    const head = await testApp.ports.storage.head({ bucket: IMPORTS_BUCKET, key: fresh.key });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'retention.ran' } });

    expect(kept.deleted).toEqual([]);
    expect(swept).toEqual({
      trigger: 'manual',
      exportsDeleted: 1,
      refreshTokensDeleted: 1,
      webhookEventsDeleted: 1,
    });
    expect(head.exists).toBe(false);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(
      await prisma.refreshToken.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(liveSessions);
    expect(audit?.after).toMatchObject({ exportsDeleted: 1, exportKeys: [fresh.key] });
  });

  it('schedules the retention cron and the worker runs it', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const schedules = await getPrisma().$queryRawUnsafe<{ name: string; cron: string }[]>(
        'SELECT name, cron FROM pgboss.schedule WHERE name = $1',
        'retention',
      );
      const jobId = await worker.app.jobs.send('retention', { trigger: 'manual' });
      const job = await waitForJob(worker, 'retention', jobId ?? '');

      expect(schedules).toEqual([{ name: 'retention', cron: '0 21 * * *' }]);
      expect(job.state).toBe('completed');
      expect(job.output).toMatchObject({ trigger: 'manual', exportsDeleted: 0 });
    } finally {
      await worker.close();
    }
  });
});
