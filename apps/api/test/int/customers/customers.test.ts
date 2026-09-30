import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CustomerDetailDto, CustomerRow } from '../../../src/modules/customers/detail.dto';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import {
  createCustomer,
  createOrderFor,
  CUSTOMER_LINE1,
  CUSTOMER_PHONE,
} from '../../helpers/customers';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

const RAW_PHONE = /\b[6-9]\d{9}\b/;

describe('admin customers: search, masked detail and sessions', () => {
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
  });

  it('searches by email prefix, phone blind index and order number, never listing staff', async () => {
    const one = await createCustomer(testApp, 'alpha.one@example.test');
    const two = await createCustomer(testApp, 'beta.two@example.test', { phone: '9123456789' });
    const product = await createProduct(testApp, { name: 'Thing', categoryId, stock: 5 });
    const order = await createOrderFor(two.id, product.variants[0]!.id, 'DELIVERED');

    const byEmail = await adminInject(testApp, staff.token, 'GET', '/admin/customers?q=ALPHA');
    const byPhone = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers?q=${CUSTOMER_PHONE}`,
    );
    const byOrder = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers?q=${order.orderNumber.toLowerCase()}`,
    );
    const noOrder = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/customers?q=PE-99999999',
    );
    const all = await adminInject(testApp, staff.token, 'GET', '/admin/customers?limit=50');
    const byAdminEmail = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/customers?q=admin@',
    );

    const ids = (res: typeof byEmail) => body<CustomerRow[]>(res).data.map((row) => row.id);
    expect(ids(byEmail)).toEqual([one.id]);
    expect(ids(byPhone)).toEqual([one.id]);
    expect(ids(byOrder)).toEqual([two.id]);
    expect(ids(noOrder)).toEqual([]);
    expect(ids(all).sort()).toEqual([one.id, two.id].sort());
    expect(body(all).meta).toMatchObject({ total: 2 });
    expect(ids(byAdminEmail)).toEqual([]);
    expect(body<CustomerRow[]>(byOrder).data[0]).toMatchObject({
      maskedEmail: 'b•••@example.test',
      maskedPhone: '91•••••789',
      maskedName: 'I. Rajan',
      orderCount: 1,
      isDisabled: false,
      deleted: false,
    });
  });

  it('returns a masked detail that never carries a raw phone, email or address line', async () => {
    const customer = await createCustomer(testApp, 'masked.person@example.test');

    const res = await adminInject(testApp, staff.token, 'GET', `/admin/customers/${customer.id}`);
    const detail = body<CustomerDetailDto>(res).data;

    expect(res.statusCode).toBe(200);
    expect(detail).toMatchObject({
      maskedEmail: 'm•••@example.test',
      maskedPhone: '98•••••210',
      maskedName: 'I. Rajan',
      locale: 'en',
      sessions: { count: 1 },
      orders: [],
      returnRequests: [],
      flags: { deleted: false, activeOrders: 0 },
    });
    expect(detail.addresses).toEqual([
      expect.objectContaining({
        maskedName: 'I. Rajan',
        maskedLine1: '•••• Street',
        maskedLine2: '•••• tank',
        maskedPhone: '98•••••210',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
        isDefault: true,
      }),
    ]);
    expect(res.body).not.toMatch(RAW_PHONE);
    expect(res.body).not.toContain('masked.person@');
    expect(res.body).not.toContain(CUSTOMER_LINE1);
    expect(res.body).not.toContain('"phone"');
    expect(res.body).not.toContain('"email"');
  });

  it('treats staff accounts as not-found on customer routes (IDOR guard)', async () => {
    for (const id of [admin.userId, staff.userId]) {
      const detail = await adminInject(testApp, admin.token, 'GET', `/admin/customers/${id}`);
      const disable = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/customers/${id}/disable`,
        {
          reason: 'trying to disable a colleague',
        },
      );
      expect(detail.statusCode).toBe(404);
      expect(disable.statusCode).toBe(404);
    }
  });

  it("lists a customer's sessions and lets an ADMIN revoke one behind step-up", async () => {
    const customer = await createCustomer(testApp);

    const list = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers/${customer.id}/sessions`,
    );
    const sessions = body<{ id: string; audience: string }[]>(list).data;
    const staffRevoke = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/sessions/${sessions[0]?.id}/revoke`,
    );
    const revoke = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/sessions/${sessions[0]?.id}/revoke`,
    );
    const refresh = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: customer.session.refreshToken },
    });
    const after = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/customers/${customer.id}/sessions`,
    );
    const audit = await getPrisma().auditLog.findFirst({
      where: { action: 'customer.session_revoked' },
    });

    expect(sessions).toEqual([
      expect.objectContaining({ id: customer.session.sessionId, audience: 'STOREFRONT' }),
    ]);
    expect(staffRevoke.statusCode).toBe(403);
    expect(revoke.statusCode).toBe(200);
    expect(refresh.statusCode).toBe(401);
    expect(body<unknown[]>(after).data).toEqual([]);
    expect(audit?.entityId).toBe(customer.session.sessionId);
  });
});
