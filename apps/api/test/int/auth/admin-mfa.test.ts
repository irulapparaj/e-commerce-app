import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { STEP_UP_TTL_SECONDS } from '../../../src/modules/auth/token.service';
import { buildTestApp, type TestApp } from '../../helpers/app';
import {
  bearer,
  enrolMfa,
  loginAdmin,
  loginCustomer,
  resetValkey,
  startAdminLogin,
  totpCode,
  verifyMfa,
} from '../../helpers/auth';
import { ADMIN_EMAIL, getPrisma, resetDb, seedMinimal } from '../../helpers/db';

const staffPayload = { email: 'staff@example.test', name: 'Staff Member', role: 'STAFF' };

describe('admin MFA enrolment, verification and step-up', () => {
  let testApp: TestApp;
  let clock = new Date('2026-09-25T10:00:00Z');

  beforeAll(async () => {
    testApp = await buildTestApp({ now: () => clock });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    clock = new Date('2026-09-25T10:00:00Z');
    await resetDb();
    await resetValkey(testApp);
    testApp.email?.clear();
    await seedMinimal(getPrisma());
  });

  it('requires enrolment for the seeded admin, then issues an admin session after TOTP', async () => {
    const challenge = await startAdminLogin(testApp, ADMIN_EMAIL);
    const enrolment = await enrolMfa(testApp, challenge.mfaToken);
    const verified = await verifyMfa(
      testApp,
      challenge.mfaToken,
      totpCode(enrolment.secret, clock),
    );
    const session = verified.json<{
      data: { accessToken: string; audience: string; user: { mfaEnabled: boolean; role: string } };
    }>().data;
    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(session.accessToken),
    });
    const stored = await getPrisma().user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const rawStored = await testApp.app.prismaRaw.user.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
    });

    expect(challenge.mfaEnrolmentRequired).toBe(true);
    expect(enrolment.otpauthUrl).toContain('otpauth://totp/');
    expect(enrolment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrolment.recoveryCodes).toHaveLength(10);
    expect(verified.statusCode).toBe(200);
    expect(session.audience).toBe('admin');
    expect(session.user).toMatchObject({ role: 'ADMIN', mfaEnabled: true });
    expect(me.json<{ data: { audience: string } }>().data.audience).toBe('admin');
    expect(stored.mfaEnabled).toBe(true);
    expect(rawStored.totpSecret).toMatch(/^v1:/);
    expect(rawStored.mfaRecoveryCodes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('requires TOTP (not enrolment) on the second login and accepts a recovery code once', async () => {
    const first = await loginAdmin(testApp, ADMIN_EMAIL, { at: clock });
    const enrolmentCodes = (
      await getPrisma().user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })
    ).mfaRecoveryCodes;

    const second = await startAdminLogin(testApp, ADMIN_EMAIL);
    const wrong = await verifyMfa(testApp, second.mfaToken, '000000');
    const ok = await verifyMfa(testApp, second.mfaToken, totpCode(first.secret, clock));

    expect(second.mfaRequired).toBe(true);
    expect(second.mfaEnrolmentRequired).toBeUndefined();
    expect(wrong.statusCode).toBe(401);
    expect(ok.statusCode).toBe(200);
    expect(enrolmentCodes).toHaveLength(10);
  });

  it('consumes recovery codes on use', async () => {
    const challenge = await startAdminLogin(testApp, ADMIN_EMAIL);
    const enrolment = await enrolMfa(testApp, challenge.mfaToken);
    const code = enrolment.recoveryCodes[0] ?? '';

    const first = await verifyMfa(testApp, challenge.mfaToken, code);
    const again = await startAdminLogin(testApp, ADMIN_EMAIL);
    const reused = await verifyMfa(testApp, again.mfaToken, code);
    const other = await verifyMfa(testApp, again.mfaToken, enrolment.recoveryCodes[1] ?? '');

    expect(first.statusCode).toBe(200);
    expect(reused.statusCode).toBe(401);
    expect(other.statusCode).toBe(200);
    expect(
      (await getPrisma().user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } }))
        .mfaRecoveryCodes,
    ).toHaveLength(8);
  });

  it('blocks admin routes before enrolment and keeps mfa tokens useless elsewhere', async () => {
    const challenge = await startAdminLogin(testApp, ADMIN_EMAIL);

    const staffWithMfaToken = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(challenge.mfaToken),
      payload: staffPayload,
    });
    const meWithMfaToken = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(challenge.mfaToken),
    });
    const enrolTwice = await enrolMfa(testApp, challenge.mfaToken);
    const adminToken = await testApp.app.auth.tokens.signAccess({
      sub:
        challenge.mfaToken &&
        (await getPrisma().user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id,
      role: 'ADMIN',
      aud: 'admin',
    });
    const beforeEnrolment = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(adminToken),
      payload: staffPayload,
    });

    expect(staffWithMfaToken.statusCode).toBe(401);
    expect(meWithMfaToken.statusCode).toBe(401);
    expect(enrolTwice.secret).toBeTruthy();
    expect(beforeEnrolment.statusCode).toBe(403);
    expect(beforeEnrolment.json<{ error: { code: string } }>().error.code).toBe(
      'MFA_ENROLMENT_REQUIRED',
    );
  });

  it('rejects storefront tokens on admin routes and customers on mfa routes', async () => {
    const customer = await loginCustomer(testApp, 'shopper@example.test');

    const staff = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(customer.accessToken),
      payload: staffPayload,
    });
    const stepUp = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/step-up',
      headers: bearer(customer.accessToken),
      payload: { code: '123456' },
    });
    const customerMfaToken = await testApp.app.auth.tokens.signAccess({
      sub: customer.user.id,
      role: 'CUSTOMER',
      aud: 'mfa',
    });
    const enrol = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enrol',
      headers: bearer(customerMfaToken),
    });

    expect(staff.statusCode).toBe(401);
    expect(stepUp.statusCode).toBe(401);
    expect(enrol.statusCode).toBe(403);
  });

  it('requires step-up for staff creation, honours the 5 minute window and emails an invite', async () => {
    const { session, secret } = await loginAdmin(testApp, ADMIN_EMAIL, { at: clock });

    const withoutStepUp = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(session.accessToken),
      payload: staffPayload,
    });
    const wrongCode = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/step-up',
      headers: bearer(session.accessToken),
      payload: { code: '000000' },
    });
    const stepUp = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/step-up',
      headers: bearer(session.accessToken),
      payload: { code: totpCode(secret, clock) },
    });
    const stepped = stepUp.json<{ data: { accessToken: string; stepUpExp: number } }>().data;
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(stepped.accessToken),
      payload: staffPayload,
    });
    const duplicate = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(stepped.accessToken),
      payload: staffPayload,
    });
    clock = new Date(clock.getTime() + (STEP_UP_TTL_SECONDS + 1) * 1000);
    const expired = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/admin/staff',
      headers: bearer(stepped.accessToken),
      payload: { ...staffPayload, email: 'later@example.test' },
    });
    const staff = await getPrisma().user.findUniqueOrThrow({
      where: { email: staffPayload.email },
    });
    const invite = testApp.email?.lastTo(staffPayload.email);

    expect(withoutStepUp.statusCode).toBe(403);
    expect(withoutStepUp.json<{ error: { code: string } }>().error.code).toBe('STEP_UP_REQUIRED');
    expect(wrongCode.statusCode).toBe(401);
    expect(stepUp.statusCode).toBe(200);
    expect(stepped.stepUpExp - Math.floor(clock.getTime() / 1000)).toBeLessThanOrEqual(0);
    expect(created.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(409);
    expect(expired.statusCode).toBe(403);
    expect(expired.json<{ error: { code: string } }>().error.code).toBe('STEP_UP_REQUIRED');
    expect(staff).toMatchObject({ role: 'STAFF', mfaEnabled: false, name: 'Staff Member' });
    expect(invite?.subject).toContain('invited');
    expect(invite?.text).toContain('/admin/login');
  });

  it('rejects requests carrying cookies but no Bearer header (API is Bearer-only)', async () => {
    const { session } = await loginAdmin(testApp, ADMIN_EMAIL, { at: clock });

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: `__Host-access=${session.accessToken}; __Host-refresh=${session.refreshToken}`,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');
  });

  it('caches disabled state briefly and rejects disabled admins on refresh', async () => {
    const { session } = await loginAdmin(testApp, ADMIN_EMAIL, { at: clock });
    await getPrisma().user.update({ where: { email: ADMIN_EMAIL }, data: { isDisabled: true } });
    testApp.app.auth.userState.invalidate(session.user.id);

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(session.accessToken),
    });
    const rotated = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });

    expect(me.statusCode).toBe(401);
    expect(rotated.statusCode).toBe(401);
  });
});
