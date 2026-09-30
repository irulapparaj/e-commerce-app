import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OTP_MAX_ATTEMPTS, OTP_MIN_RESPONSE_MS } from '../../../src/modules/auth/otp.service';
import { buildTestApp, type TestApp } from '../../helpers/app';
import {
  bearer,
  loginCustomer,
  readOtp,
  resetValkey,
  sendOtp,
  verifyOtp,
} from '../../helpers/auth';
import { getPrisma, resetDb } from '../../helpers/db';

describe('customer OTP login', () => {
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

  it('sends a code whose subject never contains it, verifies it and serves /auth/me', async () => {
    const email = 'customer@example.test';

    const { res, nonce } = await sendOtp(testApp, email);
    const message = testApp.email?.lastTo(email);
    const otp = await readOtp(testApp, email);
    const verified = await verifyOtp(testApp, email, nonce, otp);
    const session = verified.json<{
      data: {
        accessToken: string;
        refreshToken: string;
        csrfToken: string;
        user: { email: string; role: string };
      };
    }>().data;
    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(session.accessToken),
    });

    expect(res.statusCode).toBe(200);
    expect(message?.subject).toBe('Your sign-in code');
    expect(message?.subject).not.toContain(otp);
    expect(message?.text).toContain(otp);
    expect(verified.statusCode).toBe(200);
    expect(session.user).toMatchObject({ email, role: 'CUSTOMER' });
    expect(session.refreshToken.length).toBeGreaterThanOrEqual(32);
    expect(me.statusCode).toBe(200);
    expect(me.json<{ data: { user: { email: string }; audience: string } }>().data).toMatchObject({
      user: { email },
      audience: 'storefront',
    });
  });

  it('answers identically for unknown and known emails, pads the response and creates no user before verify', async () => {
    const prisma = getPrisma();
    await prisma.user.create({ data: { email: 'known@example.test' } });

    const startedUnknown = performance.now();
    const unknown = await sendOtp(testApp, 'unknown@example.test');
    const elapsedUnknown = performance.now() - startedUnknown;
    const known = await sendOtp(testApp, 'known@example.test');

    expect(unknown.res.statusCode).toBe(known.res.statusCode);
    expect(Object.keys(unknown.res.json<Record<string, unknown>>())).toEqual(
      Object.keys(known.res.json<Record<string, unknown>>()),
    );
    expect(Object.keys(unknown.res.json<{ data: object }>().data)).toEqual(['nonce']);
    expect(elapsedUnknown).toBeGreaterThanOrEqual(OTP_MIN_RESPONSE_MS - 5);
    expect(await prisma.user.count({ where: { email: 'unknown@example.test' } })).toBe(0);
  });

  it('deletes the code after five wrong attempts so the sixth, correct attempt fails; a new send works', async () => {
    const email = 'brute@example.test';
    const { nonce } = await sendOtp(testApp, email);
    const otp = await readOtp(testApp, email);
    const wrong = otp === '000000' ? '000001' : '000000';

    const failures = [];
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1)
      failures.push((await verifyOtp(testApp, email, nonce, wrong)).statusCode);
    const sixth = await verifyOtp(testApp, email, nonce, otp);
    const fresh = await sendOtp(testApp, email);
    const retry = await verifyOtp(testApp, email, fresh.nonce, await readOtp(testApp, email));

    expect(failures).toEqual([401, 401, 401, 401, 401]);
    expect(sixth.statusCode).toBe(401);
    expect(sixth.json<{ error: { code: string } }>().error.code).toBe('INVALID_OTP');
    expect(retry.statusCode).toBe(200);
  });

  it('is single-use: the same code cannot be verified twice', async () => {
    const email = 'once@example.test';
    const { nonce } = await sendOtp(testApp, email);
    const otp = await readOtp(testApp, email);

    const first = await verifyOtp(testApp, email, nonce, otp);
    const second = await verifyOtp(testApp, email, nonce, otp);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
  });

  it('rejects disabled users with the generic INVALID_OTP and issues no session', async () => {
    const prisma = getPrisma();
    const email = 'disabled@example.test';
    await prisma.user.create({ data: { email, isDisabled: true } });
    const { nonce } = await sendOtp(testApp, email);

    const res = await verifyOtp(testApp, email, nonce, await readOtp(testApp, email));

    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_OTP');
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('rejects malformed bodies and unknown keys with VALIDATION', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp',
      payload: { email: 'a@b.co', nonce: 'x', otp: '1', extra: true },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION');
  });

  it('invokes onLogin with the previous session id from the BFF header', async () => {
    const events: unknown[] = [];
    testApp.app.auth.hooks.onLogin((event) => {
      events.push(event);
    });

    const session = await loginCustomer(testApp, 'hooked@example.test', {
      'x-previous-session': 'guest-123',
    });

    expect(events).toEqual([
      { userId: session.user.id, sessionId: expect.any(String), previousSessionId: 'guest-123' },
    ]);
  });
});

describe('OTP rate limits with multiplier 1', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
  });

  it('limits sends to 3 per email per 10 minutes with a Retry-After header', async () => {
    const email = 'limited@example.test';

    const statuses = [];
    for (let i = 0; i < 4; i += 1)
      statuses.push((await sendOtp(testApp, email, `10.1.1.${i}`)).res);

    expect(statuses.map((r) => r.statusCode)).toEqual([200, 200, 200, 429]);
    expect(statuses[3]?.json<{ error: { code: string } }>().error.code).toBe('RATE_LIMITED');
    expect(Number(statuses[3]?.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits sends to 10 per IP per hour', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i += 1)
      statuses.push((await sendOtp(testApp, `ip${i}@example.test`, '10.9.9.9')).res.statusCode);

    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
