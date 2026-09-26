import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_API_URL } from '../../test-setup';

import { logout, mfaEnrol, mfaVerify, refresh, sendOtp, stepUp, verifyOtp } from './bff';

const apiResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const inputUrl = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

const mockFetch = (handler: (url: string, init: RequestInit) => Response) => {
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(inputUrl(input), init ?? {}),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
};

const post = (path: string, body: unknown, headers: Record<string, string> = {}, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(cookie === undefined ? {} : { cookie }),
      ...headers,
    },
    body: JSON.stringify(body),
  });

const session = {
  accessToken: 'at',
  refreshToken: 'rt',
  csrfToken: 'ct',
  audience: 'storefront',
  user: { id: 'u', email: 'e', role: 'CUSTOMER' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BFF auth handlers', () => {
  it('forwards send-otp server-to-server without cookies and returns the API envelope', async () => {
    const spy = mockFetch(() =>
      apiResponse(200, { success: true, data: { nonce: 'n' }, error: null }),
    );

    const res = await sendOtp(
      post('/api/auth/send-otp', { email: 'a@b.co' }, { 'user-agent': 'ua' }, '__Host-access=leak'),
    );
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { nonce: 'n' }, error: null });
    expect(url).toBe(`${TEST_API_URL}/api/v1/auth/send-otp`);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('user-agent')).toBe('ua');
  });

  it('rejects cross-site send-otp before contacting the API', async () => {
    const spy = mockFetch(() => apiResponse(200, {}));
    const request = new NextRequest('http://localhost:3000/api/auth/send-otp', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
      body: '{}',
    });

    const res = await sendOtp(request);

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sets exactly the three session cookies on verify-otp and never returns tokens to the browser', async () => {
    mockFetch(() => apiResponse(200, { success: true, data: session, error: null }));

    const res = await verifyOtp(
      post('/api/auth/verify-otp', { email: 'a@b.co', nonce: 'n', otp: '123456' }),
    );
    const body = await res.text();
    const cookies = res.cookies.getAll();

    expect(res.status).toBe(200);
    expect(body).not.toContain('"accessToken"');
    expect(body).not.toContain('rt');
    expect(cookies.map((c) => c.name)).toEqual(['__Host-access', '__Host-refresh', '__Host-csrf']);
    expect(cookies[0]).toMatchObject({
      value: 'at',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });
    expect(cookies[2]).toMatchObject({ value: 'ct', httpOnly: false });
    expect(JSON.parse(body)).toEqual({
      success: true,
      data: { user: session.user, redirect: '/account' },
      error: null,
    });
  });

  it('sets only the mfa cookie when the API asks for MFA, then swaps it for an admin session on verify', async () => {
    mockFetch(() =>
      apiResponse(200, {
        success: true,
        data: { mfaEnrolmentRequired: true, mfaToken: 'mt' },
        error: null,
      }),
    );
    const challenge = await verifyOtp(post('/api/auth/verify-otp', {}));
    const spy = mockFetch(() =>
      apiResponse(200, { success: true, data: { ...session, audience: 'admin' }, error: null }),
    );
    const verified = await mfaVerify(
      post('/api/auth/mfa/verify', { code: '123456' }, {}, '__Host-mfa=mt'),
    );
    const missing = await mfaVerify(post('/api/auth/mfa/verify', { code: '123456' }));
    const headers = new Headers((spy.mock.calls[0]?.[1] as RequestInit).headers);

    expect(challenge.cookies.getAll().map((c) => c.name)).toEqual(['__Host-mfa']);
    expect(await challenge.json()).toEqual({
      success: true,
      data: { mfaRequired: false, mfaEnrolmentRequired: true },
      error: null,
    });
    expect(headers.get('authorization')).toBe('Bearer mt');
    expect(verified.cookies.getAll().map((c) => [c.name, c.maxAge])).toEqual([
      ['__Host-access', 900],
      ['__Host-refresh', 8 * 3600],
      ['__Host-csrf', 8 * 3600],
      ['__Host-mfa', 0],
    ]);
    expect(missing.status).toBe(401);
  });

  it('forwards body-less enrol calls without a JSON content type so Fastify does not reject an empty body', async () => {
    const spy = mockFetch(() =>
      apiResponse(200, { success: true, data: { secret: 's' }, error: null }),
    );

    const res = await mfaEnrol(post('/api/auth/mfa/enrol', {}, {}, '__Host-mfa=mt'));
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(res.status).toBe(200);
    expect(init.body).toBeNull();
    expect(headers.get('content-type')).toBeNull();
    expect(headers.get('authorization')).toBe('Bearer mt');
  });

  it('refresh and logout require double-submit and rotate or clear cookies', async () => {
    mockFetch(() =>
      apiResponse(200, {
        success: true,
        data: { ...session, accessToken: 'at2', refreshToken: 'rt2', csrfToken: 'ct2' },
        error: null,
      }),
    );
    const cookie = '__Host-refresh=rt; __Host-csrf=ct';

    const noHeader = await refresh(post('/api/auth/refresh', {}, {}, cookie));
    const rotated = await refresh(post('/api/auth/refresh', {}, { 'x-csrf-token': 'ct' }, cookie));
    const loggedOut = await logout(post('/api/auth/logout', {}, { 'x-csrf-token': 'ct' }, cookie));
    mockFetch(() =>
      apiResponse(401, {
        success: false,
        data: null,
        error: { code: 'UNAUTHENTICATED', message: 'x' },
      }),
    );
    const expired = await refresh(post('/api/auth/refresh', {}, { 'x-csrf-token': 'ct' }, cookie));

    expect(noHeader.status).toBe(403);
    expect(rotated.cookies.get('__Host-access')?.value).toBe('at2');
    expect(rotated.cookies.get('__Host-refresh')?.value).toBe('rt2');
    expect(loggedOut.cookies.getAll().every((c) => c.maxAge === 0)).toBe(true);
    expect(expired.status).toBe(401);
    expect(expired.cookies.get('__Host-access')?.maxAge).toBe(0);
  });

  it('step-up replaces only the access cookie', async () => {
    mockFetch(() =>
      apiResponse(200, {
        success: true,
        data: { accessToken: 'stepped', stepUpExp: 99 },
        error: null,
      }),
    );

    const res = await stepUp(
      post(
        '/api/auth/step-up',
        { code: '123456' },
        { 'x-csrf-token': 'ct' },
        '__Host-access=at; __Host-csrf=ct',
      ),
    );

    expect(res.cookies.getAll().map((c) => c.name)).toEqual(['__Host-access']);
    expect(res.cookies.get('__Host-access')?.value).toBe('stepped');
    expect(await res.json()).toEqual({ success: true, data: { stepUpExp: 99 }, error: null });
  });
});
