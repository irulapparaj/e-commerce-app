import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { recordAudit } from '../../../src/modules/audit/record';
import { applyMovement } from '../../../src/modules/inventory/apply-movement';
import {
  adminInject,
  type AdminSession,
  body,
  loginAdminAndStaff,
  STAFF_EMAIL,
} from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { readOtp, resetValkey, sendOtp, verifyMfa, verifyOtp } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

interface AuditRow {
  readonly id: string;
  readonly action: string;
  readonly actor: { id: string; email: string; role: string } | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly createdAt: string;
}

describe('audit, security and stats routes', () => {
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
    testApp.email?.clear();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
    ({ admin, staff } = await loginAdminAndStaff(testApp));
  });

  it('filters and paginates the audit log newest first, and never returns redacted PII from before/after', async () => {
    const prisma = getPrisma();
    await adminInject(testApp, admin.steppedToken, 'PUT', '/admin/settings/return_window_days', {
      value: 9,
    });
    await adminInject(testApp, admin.steppedToken, 'PUT', '/admin/settings/return_window_days', {
      value: 10,
    });
    await adminInject(testApp, admin.steppedToken, 'POST', '/admin/staff', {
      email: 'x@example.test',
      name: 'X',
      role: 'STAFF',
    });
    // A write that carries PII/secrets through the primitive must land redacted.
    await testApp.app.prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorId: admin.userId,
        ip: '1.1.1.1',
        userAgent: 'ua',
        action: 'customer.updated',
        entityType: 'user',
        entityId: staff.userId,
        before: { phone: '9876543210', totpSecret: 's', name: 'Old' },
        after: { phone: '9000000000', line1: 'Street', name: 'New' },
      }),
    );

    const all = await adminInject(testApp, admin.token, 'GET', '/admin/audit?limit=2');
    const page2 = await adminInject(testApp, admin.token, 'GET', '/admin/audit?limit=2&page=2');
    const filtered = await adminInject(
      testApp,
      admin.token,
      'GET',
      `/admin/audit?action=settings.updated&entityId=return_window_days&actorId=${admin.userId}`,
    );
    const redacted = await adminInject(
      testApp,
      admin.token,
      'GET',
      '/admin/audit?action=customer.updated',
    );
    const ranged = await adminInject(
      testApp,
      admin.token,
      'GET',
      `/admin/audit?from=2020-01-01T00:00:00Z&to=${encodeURIComponent(new Date().toISOString())}`,
    );
    const badRange = await adminInject(
      testApp,
      admin.token,
      'GET',
      '/admin/audit?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z',
    );
    const asStaff = await adminInject(testApp, staff.token, 'GET', '/admin/audit');

    const rows = body<AuditRow[]>(all).data;
    expect(all.statusCode).toBe(200);
    expect(rows).toHaveLength(2);
    expect(body(all).meta).toMatchObject({ page: 1, limit: 2 });
    expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(rows[1]!.createdAt).getTime(),
    );
    expect(body<AuditRow[]>(page2).data.map((row) => row.id)).not.toEqual(
      rows.map((row) => row.id),
    );
    expect(body<AuditRow[]>(filtered).data.map((row) => row.after)).toEqual([10, 9]);
    expect(body<AuditRow[]>(filtered).data[0]?.actor).toMatchObject({
      id: admin.userId,
      role: 'ADMIN',
    });
    const customerRow = body<AuditRow[]>(redacted).data[0];
    expect(customerRow?.before).toEqual({ name: 'Old' });
    expect(customerRow?.after).toEqual({ name: 'New' });
    expect(JSON.stringify(body(redacted))).not.toMatch(/phone|totpSecret|line1/);
    expect(body(ranged).meta?.total).toBeGreaterThanOrEqual(4);
    expect(badRange.statusCode).toBe(400);
    expect(asStaff.statusCode).toBe(403);
    void prisma;
  });

  it('counts failed OTP and MFA attempts, lists admin sessions and revokes one with an audit row', async () => {
    const { nonce } = await sendOtp(testApp, STAFF_EMAIL);
    await verifyOtp(testApp, STAFF_EMAIL, nonce, '000000');
    const challenge = await sendOtp(testApp, STAFF_EMAIL);
    const otpRes = await verifyOtp(
      testApp,
      STAFF_EMAIL,
      challenge.nonce,
      await readOtp(testApp, STAFF_EMAIL),
    );
    const mfaToken = (JSON.parse(otpRes.body) as { data: { mfaToken: string } }).data.mfaToken;
    await verifyMfa(testApp, mfaToken, '000000');

    const overview = body<{
      adminSessions: { id: string; user: { email: string } }[];
      failedLogins24h: number;
      mfaFailures24h: number;
      webhookFailures24h: Record<string, number>;
      ledgerDrift24h: number;
      reconciliationMismatches: null;
    }>(await adminInject(testApp, admin.token, 'GET', '/admin/security')).data;
    const revoke = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/security/sessions/${staff.sessionId}/revoke`,
    );
    const afterRevoke = body<{ adminSessions: { id: string }[] }>(
      await adminInject(testApp, admin.token, 'GET', '/admin/security'),
    ).data;
    const unknown = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      '/admin/security/sessions/00000000-0000-4000-8000-000000000000/revoke',
    );

    expect(overview.failedLogins24h).toBe(1);
    expect(overview.mfaFailures24h).toBe(1);
    expect(overview.webhookFailures24h).toEqual({ RAZORPAY: 0, SHIPROCKET: 0, EMAIL: 0 });
    expect(overview.reconciliationMismatches).toBeNull();
    expect(overview.adminSessions.map((session) => session.id)).toEqual(
      expect.arrayContaining([admin.sessionId, staff.sessionId]),
    );
    expect(overview.adminSessions.every((session) => typeof session.user.email === 'string')).toBe(
      true,
    );
    expect(revoke.statusCode).toBe(200);
    expect(afterRevoke.adminSessions.map((session) => session.id)).not.toContain(staff.sessionId);
    expect(unknown.statusCode).toBe(404);
    expect(
      await getPrisma().auditLog.count({
        where: { action: 'security.session_revoked', entityId: staff.sessionId },
      }),
    ).toBe(1);
  });

  it('reports dashboard stats with a low-stock count that follows the ledger, cached for 60 s, and the GST placeholder flag', async () => {
    const product = await createProduct(testApp, { name: 'Stats product', categoryId, stock: 3 });
    const variant = product.variants[0]!;

    const first = body<{
      lowStockCount: number;
      productsActive: number;
      gstProfileIsPlaceholder: boolean;
      ordersToday: number;
      customersTotal: number;
    }>(await adminInject(testApp, staff.token, 'GET', '/admin/stats')).data;
    await getPrisma().$transaction((tx) =>
      applyMovement(
        { variantId: variant.id, delta: 20, reason: 'ADJUSTMENT', note: 'restock' },
        tx,
      ),
    );
    const cached = body<{ lowStockCount: number }>(
      await adminInject(testApp, staff.token, 'GET', '/admin/stats'),
    ).data;
    await testApp.app.cache.del('admin:stats');
    const fresh = body<{ lowStockCount: number }>(
      await adminInject(testApp, staff.token, 'GET', '/admin/stats'),
    ).data;

    expect(first.lowStockCount).toBe(1);
    expect(first.productsActive).toBe(3);
    expect(first.gstProfileIsPlaceholder).toBe(true);
    expect(first.ordersToday).toBe(0);
    expect(first.customersTotal).toBe(0);
    expect(cached.lowStockCount).toBe(1);
    expect(fresh.lowStockCount).toBe(0);
  });
});
