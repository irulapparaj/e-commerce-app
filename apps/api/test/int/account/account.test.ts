import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../helpers/app';
import { bearer, loginCustomer, readOtp, resetValkey } from '../../helpers/auth';
import { getPrisma, resetDb } from '../../helpers/db';

const CUSTOMER_EMAIL = 'customer@example.test';

/** Full reauth flow: login → send reauth OTP → verify → return step-up access token. */
const reauthCustomer = async (
  testApp: TestApp,
  accessToken: string,
  email: string,
): Promise<string> => {
  testApp.email?.clear();

  const sendRes = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/reauth/send',
    headers: bearer(accessToken),
    payload: {},
  });
  if (sendRes.statusCode !== 200) throw new Error(`reauth send failed: ${sendRes.body}`);

  const otp = await readOtp(testApp, email);
  const { nonce } = sendRes.json<{ data: { nonce: string } }>().data;

  const verifyRes = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/reauth/verify',
    headers: bearer(accessToken),
    payload: { nonce, otp },
  });
  if (verifyRes.statusCode !== 200) throw new Error(`reauth verify failed: ${verifyRes.body}`);
  return verifyRes.json<{ data: { accessToken: string } }>().data.accessToken;
};

describe('account routes', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    testApp.email?.clear();
  });

  describe('reauth flow', () => {
    it('issues a step-up token with amr reauth after valid OTP', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);
      testApp.email?.clear();

      const sendRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/reauth/send',
        headers: bearer(session.accessToken),
        payload: {},
      });
      expect(sendRes.statusCode).toBe(200);
      const { nonce } = sendRes.json<{ data: { nonce: string } }>().data;

      const otp = await readOtp(testApp, CUSTOMER_EMAIL);

      const verifyRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/reauth/verify',
        headers: bearer(session.accessToken),
        payload: { nonce, otp },
      });
      expect(verifyRes.statusCode).toBe(200);
      const { accessToken } = verifyRes.json<{ data: { accessToken: string } }>().data;
      expect(accessToken).toBeTruthy();
      expect(accessToken.length).toBeGreaterThan(20);
    });

    it('rejects wrong OTP with 401', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);
      testApp.email?.clear();

      const sendRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/reauth/send',
        headers: bearer(session.accessToken),
        payload: {},
      });
      const { nonce } = sendRes.json<{ data: { nonce: string } }>().data;

      const verifyRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/reauth/verify',
        headers: bearer(session.accessToken),
        payload: { nonce, otp: '000000' },
      });
      expect(verifyRes.statusCode).toBe(401);
    });

    it('rejects send without auth', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/reauth/send',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /account/profile', () => {
    it('updates name and returns the updated profile', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'PATCH',
        url: '/api/v1/account/profile',
        headers: bearer(session.accessToken),
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: { name: string } }>().data.name).toBe('Updated Name');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await testApp.app.inject({
        method: 'PATCH',
        url: '/api/v1/account/profile',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid phone format with 400', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'PATCH',
        url: '/api/v1/account/profile',
        headers: bearer(session.accessToken),
        payload: { phone: '1234567890' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /account/export', () => {
    it('queues export and returns 200 on first request', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);
      testApp.email?.clear();
      const stepUpToken = await reauthCustomer(testApp, session.accessToken, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/account/export',
        headers: bearer(stepUpToken),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: { queued: boolean } }>().data.queued).toBe(true);
    });

    it('rate-limits second export within 24h with 422', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);
      testApp.email?.clear();
      const stepUpToken = await reauthCustomer(testApp, session.accessToken, CUSTOMER_EMAIL);

      await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/account/export',
        headers: bearer(stepUpToken),
      });

      const secondRes = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/account/export',
        headers: bearer(stepUpToken),
      });
      expect(secondRes.statusCode).toBe(429);
    });

    it('requires reauth — base token returns 403', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/account/export',
        headers: bearer(session.accessToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /account', () => {
    it('deletes the account with reauth and returns 204', async () => {
      const prisma = getPrisma();
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);
      testApp.email?.clear();
      const stepUpToken = await reauthCustomer(testApp, session.accessToken, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'DELETE',
        url: '/api/v1/account',
        headers: bearer(stepUpToken),
      });

      expect(res.statusCode).toBe(204);

      const user = await prisma.user.findFirst({ where: { email: CUSTOMER_EMAIL } });
      expect(user?.deletedAt).not.toBeNull();
    });

    it('requires reauth — base token returns 403', async () => {
      const session = await loginCustomer(testApp, CUSTOMER_EMAIL);

      const res = await testApp.app.inject({
        method: 'DELETE',
        url: '/api/v1/account',
        headers: bearer(session.accessToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
