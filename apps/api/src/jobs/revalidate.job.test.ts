import { describe, expect, it, vi } from 'vitest';

import { createRevalidateHandler, REVALIDATE_SECRET_HEADER } from './revalidate.job';

const responder = (statuses: readonly (number | 'throw')[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : String(url), init: init ?? {} });
    const status = statuses[Math.min(index, statuses.length - 1)]!;
    index += 1;
    if (status === 'throw') throw new Error('ECONNREFUSED');
    return new Response('{}', { status });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
};

describe('revalidate job handler', () => {
  it('posts the tags with the shared secret and succeeds on the first attempt', async () => {
    const { fetchImpl, calls } = responder([200]);
    const sleep = vi.fn(async () => undefined);
    const handler = createRevalidateHandler({
      webOrigin: 'http://web:3000/',
      secret: 's3cret',
      fetchImpl,
      sleep,
    });

    const result = await handler({ tags: ['product:a', 'home'] });

    expect(result).toEqual({ revalidated: ['product:a', 'home'], attempts: 1 });
    expect(calls[0]!.url).toBe('http://web:3000/api/internal/revalidate');
    expect(new Headers(calls[0]!.init.headers).get(REVALIDATE_SECRET_HEADER)).toBe('s3cret');
    expect(calls[0]!.init.body).toBe('{"tags":["product:a","home"]}');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries after 1 s, 5 s and 30 s then gives up', async () => {
    const { fetchImpl, calls } = responder(['throw', 503, 500, 500]);
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    const log = { warn: vi.fn() };
    const handler = createRevalidateHandler({
      webOrigin: 'http://web',
      secret: 'x',
      fetchImpl,
      sleep,
      log,
    });

    await expect(handler({ tags: ['home'] })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });

    expect(calls).toHaveLength(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000, 5000, 30000]);
    expect(log.warn).toHaveBeenCalledTimes(4);
  });

  it('recovers when a later attempt succeeds', async () => {
    const { fetchImpl } = responder([500, 200]);
    const handler = createRevalidateHandler({
      webOrigin: 'http://web',
      secret: 'x',
      fetchImpl,
      sleep: async () => undefined,
      delaysMs: [1],
    });

    await expect(handler({ tags: ['search'] })).resolves.toEqual({
      revalidated: ['search'],
      attempts: 2,
    });
  });
});
