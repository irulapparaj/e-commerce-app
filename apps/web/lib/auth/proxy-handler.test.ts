import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_API_URL } from '../../test-setup';

import { proxyToApi } from './proxy-handler';

type Handler = (url: string, init: RequestInit) => Response;

const json = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });

const inputUrl = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

const mockFetch = (handler: Handler) => {
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(inputUrl(input), init ?? {}),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
};

const request = (
  method: string,
  path: string,
  options: { cookie?: string; headers?: Record<string, string>; body?: string } = {},
) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: options.body }),
  });

const rotated = {
  accessToken: 'at2',
  refreshToken: 'rt2',
  csrfToken: 'ct2',
  audience: 'storefront',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxyToApi', () => {
  it('injects Bearer from the access cookie, strips cookies both ways and echoes upstream status', async () => {
    const spy = mockFetch(() =>
      json(
        200,
        { success: true, data: [], error: null },
        { 'set-cookie': 'api=leak', 'x-request-id': 'r1' },
      ),
    );

    const res = await proxyToApi(
      request('GET', '/api/v1/products?page=2', { cookie: '__Host-access=at; __Host-refresh=rt' }),
      ['v1', 'products'],
    );
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe(`${TEST_API_URL}/api/v1/products?page=2`);
    expect(headers.get('authorization')).toBe('Bearer at');
    expect(headers.get('cookie')).toBeNull();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-request-id')).toBe('r1');
    expect(res.cookies.getAll()).toHaveLength(0);
  });

  it('on 401 refreshes once, retries with the new token and rotates cookies', async () => {
    const calls: string[] = [];
    mockFetch((url, init) => {
      const auth = new Headers(init.headers).get('authorization');
      calls.push(`${url}|${auth}`);
      if (url.endsWith('/auth/refresh'))
        return json(200, { success: true, data: rotated, error: null });
      if (auth === 'Bearer at2')
        return json(200, { success: true, data: { ok: true }, error: null });
      return json(401, {
        success: false,
        data: null,
        error: { code: 'UNAUTHENTICATED', message: 'x' },
      });
    });

    const res = await proxyToApi(
      request('POST', '/api/v1/orders', {
        cookie: '__Host-access=stale; __Host-refresh=rt; __Host-csrf=ct',
        headers: { 'x-csrf-token': 'ct', 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
      ['v1', 'orders'],
    );

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      `${TEST_API_URL}/api/v1/orders|Bearer stale`,
      `${TEST_API_URL}/api/v1/auth/refresh|null`,
      `${TEST_API_URL}/api/v1/orders|Bearer at2`,
    ]);
    expect(res.cookies.get('__Host-access')?.value).toBe('at2');
    expect(res.cookies.get('__Host-refresh')?.value).toBe('rt2');
    expect(res.cookies.get('__Host-csrf')?.value).toBe('ct2');
  });

  it('clears the session cookies when the refresh itself fails', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/refresh')
        ? json(401, {
            success: false,
            data: null,
            error: { code: 'UNAUTHENTICATED', message: 'x' },
          })
        : json(401, {
            success: false,
            data: null,
            error: { code: 'UNAUTHENTICATED', message: 'x' },
          }),
    );

    const res = await proxyToApi(
      request('GET', '/api/v1/auth/me', { cookie: '__Host-access=stale; __Host-refresh=rt' }),
      ['v1', 'auth', 'me'],
    );

    expect(res.status).toBe(401);
    expect(res.cookies.getAll().map((c) => [c.name, c.maxAge])).toEqual([
      ['__Host-access', 0],
      ['__Host-refresh', 0],
      ['__Host-csrf', 0],
    ]);
  });

  it('shares one refresh between parallel 401s (single flight)', async () => {
    let refreshes = 0;
    mockFetch((url, init) => {
      const auth = new Headers(init.headers).get('authorization');
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return json(200, { success: true, data: rotated, error: null });
      }
      return auth === 'Bearer at2'
        ? json(200, { success: true, data: {}, error: null })
        : json(401, {
            success: false,
            data: null,
            error: { code: 'UNAUTHENTICATED', message: 'x' },
          });
    });
    const make = () =>
      request('GET', '/api/v1/auth/me', { cookie: '__Host-access=stale; __Host-refresh=same' });

    const [a, b, c] = await Promise.all([
      proxyToApi(make(), ['v1', 'auth', 'me']),
      proxyToApi(make(), ['v1', 'auth', 'me']),
      proxyToApi(make(), ['v1', 'auth', 'me']),
    ]);

    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it('enforces CSRF on non-GET requests before proxying', async () => {
    const spy = mockFetch(() => json(200, {}));

    const crossSite = await proxyToApi(
      new NextRequest('http://localhost:3000/api/v1/cart', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
        body: '{}',
      }),
      ['v1', 'cart'],
    );
    const missingToken = await proxyToApi(
      request('POST', '/api/v1/cart', { cookie: '__Host-csrf=ct', body: '{}' }),
      ['v1', 'cart'],
    );
    const anonymousSameOrigin = await proxyToApi(
      request('POST', '/api/v1/newsletter/subscribe', { body: '{}' }),
      ['v1', 'newsletter', 'subscribe'],
    );

    expect(crossSite.status).toBe(403);
    expect(missingToken.status).toBe(403);
    expect(anonymousSameOrigin.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh without a refresh cookie', async () => {
    const spy = mockFetch(() =>
      json(401, { success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );

    const res = await proxyToApi(request('GET', '/api/v1/auth/me'), ['v1', 'auth', 'me']);

    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.cookies.getAll()).toHaveLength(0);
  });
});
