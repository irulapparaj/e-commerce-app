import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_API_URL } from '@/test-setup';
import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';

const cookieStore = { get: vi.fn<(name: string) => { value: string } | undefined>() };
const cookies = vi.fn(async () => cookieStore);

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: () => cookies() }));

const { apiGet } = await import('./server');

const lastInit = (): RequestInit => {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  return call?.[1] ?? {};
};

describe('apiGet', () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookies.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the private API with cache tags, unwraps the envelope and never sends cookies', async () => {
    const calls = stubFetch(() => okEnvelope([{ slug: 'agarbatti' }]));
    cookieStore.get.mockReturnValue({ value: 'access-token' });

    const result = await apiGet<{ slug: string }[]>('/categories', {
      tags: ['categories'],
      revalidate: 300,
    });
    const headers = new Headers(lastInit().headers);

    expect(result).toEqual({ data: [{ slug: 'agarbatti' }] });
    expect(calls[0]).toMatchObject({ url: `${TEST_API_URL}/api/v1/categories`, method: 'GET' });
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(lastInit()).toMatchObject({ next: { tags: ['categories'], revalidate: 300 } });
    expect(lastInit().cache).toBeUndefined();
    expect(cookies).not.toHaveBeenCalled();
  });

  it('forwards the access cookie as Bearer only when asked, and then never caches', async () => {
    stubFetch(() => okEnvelope({ userId: 'u1' }));
    cookieStore.get.mockReturnValue({ value: 'access-token' });

    await apiGet('/me', { auth: true, tags: ['ignored'], revalidate: 60 });
    const headers = new Headers(lastInit().headers);

    expect(cookieStore.get).toHaveBeenCalledWith('__Host-access');
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('cookie')).toBeNull();
    expect(lastInit().cache).toBe('no-store');
    expect(lastInit()).not.toHaveProperty('next');
  });

  it('sends no Bearer when there is no access cookie or no request scope', async () => {
    stubFetch(() => okEnvelope(null));
    cookieStore.get.mockReturnValue(undefined);
    await apiGet('/me', { auth: true });
    expect(new Headers(lastInit().headers).get('authorization')).toBeNull();

    cookies.mockRejectedValueOnce(new Error('outside request scope'));
    await apiGet('/me', { auth: true });
    expect(new Headers(lastInit().headers).get('authorization')).toBeNull();
  });

  it('passes an empty next config when no cache options are given', async () => {
    stubFetch(() => okEnvelope(1));
    await apiGet('/settings/public');
    expect(lastInit()).toMatchObject({ next: {} });
  });

  it('throws ApiError with the envelope code and HTTP status', async () => {
    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'Product not found'));

    await expect(apiGet('/products/nope')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'NOT_FOUND',
      status: 404,
      message: 'Product not found',
    });
  });

  it('maps a non-envelope upstream body to INTERNAL with the status', async () => {
    stubFetch(() => new Response('bad gateway', { status: 502 }));

    await expect(apiGet('/categories')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});
