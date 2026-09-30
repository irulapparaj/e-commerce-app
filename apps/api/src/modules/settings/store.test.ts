import { SETTING_DEFAULTS } from '@pe/shared';
import { describe, expect, it, vi } from 'vitest';

import type { JsonCache } from '../../lib/cache';

import { createSettingsStore, PUBLIC_SETTINGS_CACHE_KEY } from './store';

const memoryCache = () => {
  const store = new Map<string, unknown>();
  const set = vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  });
  const cache: JsonCache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null) as JsonCache['get'],
    set,
    del: vi.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  };
  return { cache, store, set };
};

const prismaWith = (rows: { key: string; value: unknown }[]) => {
  const findMany = vi.fn(async () => rows);
  const upsert = vi.fn(async () => undefined);
  return { prisma: { siteSetting: { findMany, upsert } }, findMany, upsert };
};

describe('settings store', () => {
  it('fills missing keys with defaults and replaces invalid rows with defaults (warning)', async () => {
    const warn = vi.fn();
    const { prisma } = prismaWith([
      { key: 'free_shipping_threshold', value: 49900 },
      { key: 'brand', value: { name: 'x'.repeat(50) } },
      { key: 'legacy_key', value: 1 },
    ]);
    const store = createSettingsStore({
      prisma: prisma as never,
      cache: memoryCache().cache,
      log: { warn },
    });

    const all = await store.getAll();

    expect(all.free_shipping_threshold).toBe(49900);
    expect(all.brand).toEqual(SETTING_DEFAULTS.brand);
    expect(all.return_window_days).toBe(SETTING_DEFAULTS.return_window_days);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await store.get('gst_profile')).toEqual(SETTING_DEFAULTS.gst_profile);
  });

  it('caches the public subset for 60 s and invalidates on demand', async () => {
    const { prisma, findMany } = prismaWith([]);
    const { cache, store: memory, set } = memoryCache();
    const store = createSettingsStore({ prisma: prisma as never, cache, log: { warn: vi.fn() } });

    const first = await store.getPublic();
    const second = await store.getPublic();
    await store.invalidate();

    expect(first).toEqual(second);
    expect(first).not.toHaveProperty('gst_profile');
    expect(first.pickupLocation).toEqual({ city: 'Chennai' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(PUBLIC_SETTINGS_CACHE_KEY, first, 60);
    expect(memory.has(PUBLIC_SETTINGS_CACHE_KEY)).toBe(false);
  });

  it('upserts a validated value through the caller transaction', async () => {
    const { prisma, upsert } = prismaWith([]);
    const store = createSettingsStore({
      prisma: prisma as never,
      cache: memoryCache().cache,
      log: { warn: vi.fn() },
    });

    await store.set(prisma as never, 'return_window_days', 21, 'user-1');

    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'return_window_days' },
      create: { key: 'return_window_days', value: 21, updatedBy: 'user-1' },
      update: { value: 21, updatedBy: 'user-1' },
    });
    await expect(store.set(prisma as never, 'nope' as never, 1 as never, null)).rejects.toThrow(
      'unknown setting',
    );
  });
});
