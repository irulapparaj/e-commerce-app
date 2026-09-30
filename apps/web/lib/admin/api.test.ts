import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, adminApi, isAdminApiError, setStepUpHandler } from './api';

const envelope = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const okBody = (data: unknown, meta?: unknown) => ({
  success: true,
  data,
  error: null,
  ...(meta === undefined ? {} : { meta }),
});
const stepUpBody = {
  success: false,
  data: null,
  error: { code: 'STEP_UP_REQUIRED', message: 'Recent re-authentication required' },
};

const mockFetch = (handler: (call: number, init: RequestInit) => Response) => {
  let calls = 0;
  const spy = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return handler(calls, init ?? {});
  });
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
  setStepUpHandler(async () => false)();
});

describe('adminApi', () => {
  it('returns data and meta from a success envelope and prefixes /api/v1', async () => {
    const spy = mockFetch(() => envelope(200, okBody([1], { page: 1, limit: 20, total: 1 })));

    const result = await adminApi.get<number[]>('/admin/audit?page=1');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];

    expect(result).toEqual({ data: [1], meta: { page: 1, limit: 20, total: 1 } });
    expect(url).toBe('/api/v1/admin/audit?page=1');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('x-csrf-token')).toBeNull();
  });

  it('sends JSON bodies with the csrf header on mutations and omits both when body-less', async () => {
    vi.stubGlobal('document', { cookie: '__Host-csrf=ct; other=1' });
    const spy = mockFetch(() => envelope(200, okBody({ ok: true })));

    await adminApi.put('/admin/settings/brand', { value: { name: 'x' } });
    await adminApi.post('/admin/staff/1/mfa-reset');
    await adminApi.del('/admin/things/1');
    const put = spy.mock.calls[0]?.[1] as RequestInit;
    const post = spy.mock.calls[1]?.[1] as RequestInit;
    const del = spy.mock.calls[2]?.[1] as RequestInit;

    expect(put.method).toBe('PUT');
    expect(put.body).toBe(JSON.stringify({ value: { name: 'x' } }));
    expect(new Headers(put.headers).get('content-type')).toBe('application/json');
    expect(new Headers(put.headers).get('x-csrf-token')).toBe('ct');
    expect(post.body).toBeUndefined();
    expect(new Headers(post.headers).get('content-type')).toBeNull();
    expect(new Headers(post.headers).get('x-csrf-token')).toBe('ct');
    expect(del.method).toBe('DELETE');
  });

  it('maps a failure envelope to AdminApiError with code, status, message and details', async () => {
    mockFetch(() =>
      envelope(400, {
        success: false,
        data: null,
        error: { code: 'VALIDATION', message: 'Bad', details: [{ path: 'name', message: 'x' }] },
      }),
    );

    const error = await adminApi.post('/admin/staff', {}).catch((e: unknown) => e);

    expect(isAdminApiError(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AdminApiError',
      code: 'VALIDATION',
      status: 400,
      message: 'Bad',
      details: [{ path: 'name', message: 'x' }],
    });
  });

  it('wraps non-JSON responses as INTERNAL errors with the HTTP status', async () => {
    mockFetch(() => new Response('<html>bad gateway</html>', { status: 502 }));

    const error = await adminApi.get('/admin/stats').catch((e: unknown) => e as AdminApiError);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502 });
  });

  it('runs the step-up handler on 403 STEP_UP_REQUIRED and retries the original request once', async () => {
    const handler = vi.fn(async () => true);
    setStepUpHandler(handler);
    const spy = mockFetch((call) =>
      call === 1 ? envelope(403, stepUpBody) : envelope(200, okBody({ saved: true })),
    );

    const result = await adminApi.put('/admin/settings/free_shipping_threshold', { value: 1 });

    expect(result).toEqual({ data: { saved: true } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((spy.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ value: 1 }));
  });

  it('throws after a second STEP_UP_REQUIRED instead of looping', async () => {
    const handler = vi.fn(async () => true);
    setStepUpHandler(handler);
    const spy = mockFetch(() => envelope(403, stepUpBody));

    const error = await adminApi.post('/admin/staff', {}).catch((e: unknown) => e as AdminApiError);

    expect(error).toMatchObject({ code: 'STEP_UP_REQUIRED', status: 403 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws STEP_UP_REQUIRED without retrying when the dialog is cancelled', async () => {
    setStepUpHandler(async () => false);
    const spy = mockFetch(() => envelope(403, stepUpBody));

    const error = await adminApi.post('/admin/staff', {}).catch((e: unknown) => e as AdminApiError);

    expect(error).toMatchObject({ code: 'STEP_UP_REQUIRED', message: 'Confirmation cancelled' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throws STEP_UP_REQUIRED when no handler is installed', async () => {
    const spy = mockFetch(() => envelope(403, stepUpBody));

    const error = await adminApi.post('/admin/staff', {}).catch((e: unknown) => e as AdminApiError);

    expect(error).toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shares one step-up dialog between parallel requests and unregisters only its own handler', async () => {
    let resolveDialog: (ok: boolean) => void = () => undefined;
    const handler = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveDialog = resolve;
        }),
    );
    const unregister = setStepUpHandler(handler);
    mockFetch((call) => (call <= 2 ? envelope(403, stepUpBody) : envelope(200, okBody({ call }))));

    const pending = Promise.all([adminApi.post('/admin/a'), adminApi.post('/admin/b')]);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    resolveDialog(true);
    const [a, b] = await pending;

    expect(a.data).toEqual({ call: 3 });
    expect(b.data).toEqual({ call: 4 });
    setStepUpHandler(async () => true);
    unregister();
    mockFetch((call) => (call === 1 ? envelope(403, stepUpBody) : envelope(200, okBody(1))));
    await expect(adminApi.post('/admin/c')).resolves.toEqual({ data: 1 });
  });
});
