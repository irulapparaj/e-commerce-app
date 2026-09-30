import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';

import { apiClient } from './client';

const lastInit = (): RequestInit => {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  return call?.[1] ?? {};
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('GETs through the BFF with same-origin cookies and no csrf header', async () => {
    const calls = stubFetch(() => okEnvelope({ items: [] }, { page: 1, limit: 20, total: 0 }));

    const result = await apiClient.get<{ items: never[] }>('/cart');

    expect(result).toEqual({ data: { items: [] }, meta: { page: 1, limit: 20, total: 0 } });
    expect(calls[0]).toMatchObject({ url: '/api/v1/cart', method: 'GET' });
    expect(lastInit().credentials).toBe('same-origin');
    expect(new Headers(lastInit().headers).get('x-csrf-token')).toBeNull();
    expect(new Headers(lastInit().headers).get('content-type')).toBeNull();
  });

  it('adds the csrf double-submit header and JSON body on mutations', async () => {
    vi.stubGlobal('document', { cookie: 'other=1; __Host-csrf=csrf-token' });
    const calls = stubFetch(() => okEnvelope({ ok: true }));

    await apiClient.post('/cart/items', { variantId: 'v1', quantity: 2 });
    await apiClient.put('/cart/items/v1', { quantity: 3 });
    await apiClient.patch('/account', { name: 'A' });
    await apiClient.del('/cart/items/v1');

    expect(calls.map((call) => call.method)).toEqual(['POST', 'PUT', 'PATCH', 'DELETE']);
    expect(calls[0]?.body).toEqual({ variantId: 'v1', quantity: 2 });
    for (const call of vi.mocked(fetch).mock.calls) {
      const init = call[1] as RequestInit;
      expect(new Headers(init.headers).get('x-csrf-token')).toBe('csrf-token');
    }
    expect(new Headers(lastInit().headers).get('content-type')).toBeNull();
  });

  it('omits the csrf header when the cookie is missing', async () => {
    vi.stubGlobal('document', { cookie: '' });
    stubFetch(() => okEnvelope(null));

    await apiClient.post('/cart/items', { variantId: 'v1' });

    expect(new Headers(lastInit().headers).get('x-csrf-token')).toBeNull();
  });

  it('throws ApiError for error envelopes', async () => {
    stubFetch(() => errorEnvelope(409, 'INSUFFICIENT_STOCK', 'Only 2 left'));

    await expect(apiClient.post('/cart/items', {})).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
      message: 'Only 2 left',
    });
  });
});
