import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { createJsonCache } from './cache';

const valkey = (overrides: Partial<Record<'get' | 'set' | 'del', unknown>> = {}) => {
  const get = vi.fn(async () => JSON.stringify({ a: 1 }));
  const set = vi.fn(async () => 'OK');
  const del = vi.fn(async () => 1);
  return { client: { get, set, del, ...overrides } as unknown as Redis, get, set, del };
};

describe('json cache', () => {
  it('round-trips JSON with a TTL', async () => {
    const { client, set, del } = valkey();
    const cache = createJsonCache(client, { warn: vi.fn() });

    await cache.set('k', { a: 1 }, 30);
    expect(await cache.get<{ a: number }>('k')).toEqual({ a: 1 });
    await cache.del('k', 'j');

    expect(set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 30);
    expect(del).toHaveBeenCalledWith('k', 'j');
  });

  it('degrades to misses when Valkey is unavailable and logs once per operation', async () => {
    const failing = vi.fn(async () => {
      throw new Error('connection closed');
    });
    const warn = vi.fn();
    const cache = createJsonCache(valkey({ get: failing, set: failing, del: failing }).client, {
      warn,
    });

    expect(await cache.get('k')).toBeNull();
    await cache.set('k', 1, 1);
    await cache.del('k');
    await cache.del();

    expect(warn).toHaveBeenCalledTimes(3);
  });
});
