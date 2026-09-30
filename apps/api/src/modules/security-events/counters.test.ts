import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { bucketKey, createSecurityCounters, windowKeys } from './counters';

const HOUR = 3_600_000;

describe('security counter windows', () => {
  it('buckets by UTC hour and produces 24 consecutive keys ending with the current hour', () => {
    const at = Date.UTC(2026, 8, 26, 10, 30);

    expect(bucketKey('auth.otp.failed', at)).toBe(`sec:auth.otp.failed:${Math.floor(at / HOUR)}`);
    expect(bucketKey('auth.otp.failed', at + 29 * 60_000)).toBe(bucketKey('auth.otp.failed', at));
    expect(bucketKey('auth.otp.failed', at + 30 * 60_000)).not.toBe(
      bucketKey('auth.otp.failed', at),
    );
    const keys = windowKeys('auth.mfa.failed', at);
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe(bucketKey('auth.mfa.failed', at));
    expect(keys[23]).toBe(bucketKey('auth.mfa.failed', at - 23 * HOUR));
    expect(keys).not.toContain(bucketKey('auth.mfa.failed', at - 24 * HOUR));
  });

  it('increments with a 25 h expiry and sums the window, treating misses as zero', async () => {
    const exec = vi.fn(async () => []);
    const expire = vi.fn(() => ({ exec }));
    const incr = vi.fn(() => ({ expire }));
    const multi = vi.fn(() => ({ incr }));
    const mget = vi.fn(async () => ['3', null, '4']);
    const counters = createSecurityCounters(
      { multi, mget } as unknown as Redis,
      { warn: vi.fn() },
      () => 0,
    );

    await counters.increment('auth.otp.failed');
    const total = await counters.count24h('auth.otp.failed');

    expect(incr).toHaveBeenCalledWith('sec:auth.otp.failed:0');
    expect(expire).toHaveBeenCalledWith('sec:auth.otp.failed:0', 25 * 3600);
    expect(total).toBe(7);
  });

  it('swallows Valkey errors and reports zero', async () => {
    const warn = vi.fn();
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    const counters = createSecurityCounters(
      {
        multi: () => ({ incr: () => ({ expire: () => ({ exec: failing }) }) }),
        mget: failing,
      } as unknown as Redis,
      { warn },
    );

    await counters.increment('auth.mfa.failed');
    expect(await counters.count24h('auth.mfa.failed')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
