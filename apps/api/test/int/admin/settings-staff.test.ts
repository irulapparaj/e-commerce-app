import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  adminInject,
  type AdminSession,
  body,
  loginAdminAndStaff,
  STAFF_EMAIL,
} from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey, startAdminLogin } from '../../helpers/auth';
import { ADMIN_EMAIL, getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs, revalidateTagsEnqueued } from '../../helpers/jobs';

describe('admin settings and staff routes', () => {
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
    testApp.email?.clear();
    await seedMinimal(getPrisma());
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  describe('settings', () => {
    it('returns every key with defaults filled and lets ADMIN replace the GST placeholder with an audit trail', async () => {
      const all = body<Record<string, unknown>>(
        await adminInject(testApp, staff.token, 'GET', '/admin/settings'),
      ).data;
      const real = {
        gstin: '33ABCDE1234F1Z5',
        legalName: 'Real Legal Name',
        addressLines: ['1 Temple Street', 'Chennai 600001'],
        isPlaceholder: false,
      };

      const updated = await adminInject(
        testApp,
        admin.steppedToken,
        'PUT',
        '/admin/settings/gst_profile',
        { value: real },
      );
      const after = body<Record<string, { isPlaceholder: boolean }>>(
        await adminInject(testApp, staff.token, 'GET', '/admin/settings'),
      ).data;
      const audit = await getPrisma().auditLog.findFirst({
        where: { action: 'settings.updated', entityId: 'gst_profile' },
      });
      const publicSettings = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/settings/public',
      });

      expect(Object.keys(all).sort()).toEqual([
        'announcement_bar',
        'brand',
        'courier_preferences',
        'free_shipping_threshold',
        'gst_profile',
        'pickup_location',
        'promo_popup',
        'return_window_days',
      ]);
      expect(updated.statusCode).toBe(200);
      expect(body(updated).data).toEqual(real);
      expect(after.gst_profile?.isPlaceholder).toBe(false);
      expect(audit).toMatchObject({
        actorId: admin.userId,
        before: expect.objectContaining({ isPlaceholder: true }),
        after: real,
      });
      // The registered business block is public by design (footer, invoices); the raw key is not.
      expect(
        body<{ business: { gstin: string; isPlaceholder: boolean } }>(publicSettings).data.business,
      ).toMatchObject({ gstin: '33ABCDE1234F1Z5', isPlaceholder: false });
      expect(publicSettings.body).not.toContain('gst_profile');
    });

    it('rejects invalid values with field errors, unknown keys with 404, STAFF with 403 and missing step-up with STEP_UP_REQUIRED', async () => {
      const badGstin = await adminInject(
        testApp,
        admin.steppedToken,
        'PUT',
        '/admin/settings/gst_profile',
        {
          value: {
            gstin: '29ABCDE1234F1Z5',
            legalName: 'x',
            addressLines: ['a'],
            isPlaceholder: false,
          },
        },
      );
      const unknown = await adminInject(
        testApp,
        admin.steppedToken,
        'PUT',
        '/admin/settings/nope',
        { value: 1 },
      );
      const asStaff = await adminInject(
        testApp,
        staff.steppedToken,
        'PUT',
        '/admin/settings/return_window_days',
        { value: 14 },
      );
      const noStepUp = await adminInject(
        testApp,
        admin.token,
        'PUT',
        '/admin/settings/return_window_days',
        { value: 14 },
      );
      const extraField = await adminInject(
        testApp,
        admin.steppedToken,
        'PUT',
        '/admin/settings/return_window_days',
        { value: 14, extra: true },
      );

      expect(badGstin.statusCode).toBe(400);
      expect(body(badGstin).error).toMatchObject({ code: 'VALIDATION' });
      expect(JSON.stringify(body(badGstin).error)).toContain('gstin');
      expect(unknown.statusCode).toBe(404);
      expect(asStaff.statusCode).toBe(403);
      expect(body(asStaff).error?.code).toBe('FORBIDDEN');
      expect(noStepUp.statusCode).toBe(403);
      expect(body(noStepUp).error?.code).toBe('STEP_UP_REQUIRED');
      expect(extraField.statusCode).toBe(400);
    });

    it('invalidates the public cache and revalidates the home page when brand or announcement change', async () => {
      await testApp.app.inject({ method: 'GET', url: '/api/v1/settings/public' });

      const res = await adminInject(
        testApp,
        admin.steppedToken,
        'PUT',
        '/admin/settings/announcement_bar',
        { value: { enabled: true, text: 'Diwali offers live' } },
      );
      const pub = await testApp.app.inject({ method: 'GET', url: '/api/v1/settings/public' });
      await adminInject(testApp, admin.steppedToken, 'PUT', '/admin/settings/return_window_days', {
        value: 21,
      });

      expect(res.statusCode).toBe(200);
      expect(pub.body).toContain('Diwali offers live');
      expect(await revalidateTagsEnqueued()).toEqual([['home', 'settings']]);
    });
  });

  describe('staff', () => {
    it('lists staff with MFA state, session counts and last login', async () => {
      const rows = body<
        {
          email: string;
          role: string;
          mfaEnabled: boolean;
          sessionCount: number;
          lastLoginAt: string | null;
        }[]
      >(await adminInject(testApp, admin.token, 'GET', '/admin/staff')).data;

      const adminRow = rows.find((row) => row.email === ADMIN_EMAIL);
      const staffRow = rows.find((row) => row.email === STAFF_EMAIL);
      expect(adminRow).toMatchObject({ role: 'ADMIN', mfaEnabled: true, sessionCount: 1 });
      expect(staffRow).toMatchObject({ role: 'STAFF', mfaEnabled: true, sessionCount: 1 });
      expect(adminRow?.lastLoginAt).not.toBeNull();
      expect(JSON.stringify(rows)).not.toContain('totpSecret');
    });

    it('invites staff with an audit row, changes roles with session revocation and refuses to demote the last admin', async () => {
      const invited = await adminInject(testApp, admin.steppedToken, 'POST', '/admin/staff', {
        email: 'new-staff@example.test',
        name: 'New Staff',
        role: 'STAFF',
      });
      const promoted = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/staff/${staff.userId}/role`,
        { role: 'ADMIN' },
      );
      const staffRefresh = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: staff.refreshToken },
      });
      const demoteSelfAllowed = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/staff/${admin.userId}/role`,
        { role: 'STAFF' },
      );
      const lastAdmin = await adminInject(
        testApp,
        staff.steppedToken,
        'POST',
        `/admin/staff/${staff.userId}/role`,
        { role: 'STAFF' },
      );
      const audits = await getPrisma().auditLog.findMany({
        where: { action: { in: ['staff.created', 'staff.role_changed'] } },
        orderBy: { createdAt: 'asc' },
      });

      expect(invited.statusCode).toBe(201);
      expect(promoted.statusCode).toBe(200);
      expect(body<{ user: { role: string } }>(promoted).data.user.role).toBe('ADMIN');
      expect(staffRefresh.statusCode).toBe(401);
      expect(demoteSelfAllowed.statusCode).toBe(200);
      expect(lastAdmin.statusCode).toBe(409);
      expect(audits.map((row) => row.action)).toEqual([
        'staff.created',
        'staff.role_changed',
        'staff.role_changed',
      ]);
      expect(audits[1]).toMatchObject({ before: { role: 'STAFF' }, after: { role: 'ADMIN' } });
    });

    it('revoke-sessions revokes every active session of the target with an audit row', async () => {
      const refreshBefore = await getPrisma().refreshToken.findMany({
        where: { userId: staff.userId, revokedAt: null },
      });

      const res = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/staff/${staff.userId}/revoke-sessions`,
      );
      const refreshAfter = await getPrisma().refreshToken.findMany({
        where: { userId: staff.userId, revokedAt: null },
      });
      const rotate = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: staff.refreshToken },
      });

      expect(res.statusCode).toBe(200);
      expect(refreshBefore.length).toBeGreaterThan(0);
      expect(body<{ revoked: number }>(res).data.revoked).toBe(refreshBefore.length);
      expect(refreshAfter).toHaveLength(0);
      expect(rotate.statusCode).toBe(401);
      expect(
        await getPrisma().auditLog.count({
          where: { action: 'staff.sessions_revoked', entityId: staff.userId },
        }),
      ).toBe(1);
    });

    it('mfa-reset clears the secret, revokes sessions, emails the user and forces enrolment on the next login', async () => {
      const res = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/staff/${staff.userId}/mfa-reset`,
      );
      const user = await testApp.app.prismaRaw.user.findUniqueOrThrow({
        where: { id: staff.userId },
      });
      const blocked = await adminInject(testApp, staff.token, 'GET', '/admin/stats');
      const challenge = await startAdminLogin(testApp, STAFF_EMAIL);
      const mail = testApp.email?.messages.find(
        (message) => message.to === STAFF_EMAIL && message.subject.includes('reset'),
      );

      expect(res.statusCode).toBe(200);
      expect(user).toMatchObject({ mfaEnabled: false, totpSecret: null, mfaRecoveryCodes: [] });
      expect(blocked.statusCode).toBe(403);
      expect(body(blocked).error?.code).toBe('MFA_ENROLMENT_REQUIRED');
      expect(challenge.mfaEnrolmentRequired).toBe(true);
      expect(mail?.subject).toContain('reset');
      expect(
        await getPrisma().auditLog.count({
          where: { action: 'staff.mfa_reset', entityId: staff.userId },
        }),
      ).toBe(1);
    });
  });
});
