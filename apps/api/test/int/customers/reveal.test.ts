import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PiiDto } from '../../../src/modules/customers/detail.dto';
import { REVEAL_RATE_LIMIT } from '../../../src/modules/customers/reveal.service';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { bearer, resetValkey } from '../../helpers/auth';
import { createCustomer, CUSTOMER_LINE1, CUSTOMER_PHONE } from '../../helpers/customers';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

const REASON = 'Customer called support about a lost parcel';

describe('admin customers: PII reveal', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;

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
    await seedMinimal(getPrisma());
    ({ admin, staff } = await loginAdminAndStaff(testApp));
  });

  const readPii = (token: string, customerId: string, revealToken: string | undefined) =>
    testApp.app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${customerId}/pii`,
      headers: {
        ...bearer(token),
        ...(revealToken === undefined ? {} : { 'x-reveal-token': revealToken }),
      },
    });

  it('needs ADMIN + step-up + a reason, then returns a time-boxed token bound to the customer', async () => {
    const customer = await createCustomer(testApp);
    const other = await createCustomer(testApp, 'other.person@example.test');

    const asStaff = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/reveal`,
      { reason: REASON },
    );
    const noStepUp = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/customers/${customer.id}/reveal`,
      { reason: REASON },
    );
    const shortReason = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/reveal`,
      { reason: 'short' },
    );
    const granted = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/reveal`,
      { reason: REASON },
    );
    const { revealToken, expiresAt } = body<{ revealToken: string; expiresAt: string }>(
      granted,
    ).data;
    const pii = await readPii(admin.token, customer.id, revealToken);
    const wrongCustomer = await readPii(admin.token, other.id, revealToken);
    const missingHeader = await readPii(admin.token, customer.id, undefined);
    const garbage = await readPii(admin.token, customer.id, 'not-a-token');
    const staffRead = await readPii(staff.token, customer.id, revealToken);
    const audits = await getPrisma().auditLog.findMany({
      where: { action: { in: ['customer.pii.reveal', 'customer.pii.read'] } },
      orderBy: { createdAt: 'asc' },
    });

    expect(asStaff.statusCode).toBe(403);
    expect(noStepUp.statusCode).toBe(403);
    expect(body(noStepUp).error?.code).toBe('STEP_UP_REQUIRED');
    expect(shortReason.statusCode).toBe(400);
    expect(granted.statusCode).toBe(200);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(290_000);
    expect(pii.statusCode).toBe(200);
    expect(body<PiiDto>(pii).data).toMatchObject({
      email: customer.email,
      phone: CUSTOMER_PHONE,
      name: 'Irul Rajan',
      addresses: [
        expect.objectContaining({ line1: CUSTOMER_LINE1, phone: CUSTOMER_PHONE, city: 'Chennai' }),
      ],
    });
    for (const refused of [wrongCustomer, missingHeader, garbage]) {
      expect(refused.statusCode).toBe(401);
      expect(body(refused).error?.code).toBe('REVEAL_EXPIRED');
    }
    expect(staffRead.statusCode).toBe(403);
    expect(audits.map((row) => [row.action, row.entityId])).toEqual([
      ['customer.pii.reveal', customer.id],
      ['customer.pii.read', customer.id],
    ]);
    expect(audits[0]?.after).toMatchObject({ reason: REASON });
  });

  it('rejects a token replayed by a different admin and one that has expired', async () => {
    const customer = await createCustomer(testApp);
    const second = await getPrisma().user.create({
      data: { email: 'second.admin@example.test', role: 'ADMIN' },
      select: { id: true },
    });
    const otherAdminToken = await testApp.app.auth.tokens.signAccess({
      sub: second.id,
      role: 'ADMIN',
      aud: 'admin',
    });
    await getPrisma().user.update({ where: { id: second.id }, data: { mfaEnabled: true } });
    const granted = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/customers/${customer.id}/reveal`,
      { reason: REASON },
    );
    const { revealToken } = body<{ revealToken: string }>(granted).data;
    const later = await buildTestApp({ now: () => new Date(Date.now() + 6 * 60_000) });
    try {
      const replay = await readPii(otherAdminToken, customer.id, revealToken);
      const expired = await later.app.inject({
        method: 'GET',
        url: `/api/v1/admin/customers/${customer.id}/pii`,
        headers: { ...bearer(admin.token), 'x-reveal-token': revealToken },
      });

      expect(replay.statusCode).toBe(401);
      expect(expired.statusCode).toBe(401);
      expect(body(expired).error?.code).toBe('REVEAL_EXPIRED');
    } finally {
      await later.close();
    }
  });

  it('limits reveals to 30 per admin per day and counts the overflow on the security page', async () => {
    const strict = await buildTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    try {
      const customer = await createCustomer(testApp);
      const statuses: number[] = [];
      for (let attempt = 0; attempt < REVEAL_RATE_LIMIT.limit + 1; attempt += 1) {
        const res = await strict.app.inject({
          method: 'POST',
          url: `/api/v1/admin/customers/${customer.id}/reveal`,
          headers: bearer(admin.steppedToken),
          payload: { reason: REASON },
        });
        statuses.push(res.statusCode);
      }
      const security = await strict.app.inject({
        method: 'GET',
        url: '/api/v1/admin/security',
        headers: bearer(admin.token),
      });

      expect(statuses.filter((status) => status === 200)).toHaveLength(REVEAL_RATE_LIMIT.limit);
      expect(statuses.at(-1)).toBe(429);
      expect(body<{ piiRevealLimited24h: number }>(security).data.piiRevealLimited24h).toBe(1);
    } finally {
      await strict.close();
    }
  });
});
