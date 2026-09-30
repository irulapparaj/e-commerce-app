import { randomBytes } from 'node:crypto';

import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitedError } from '../../plugins/rate-limit';
import type { RateLimiter } from '../../plugins/rate-limit';
import { EnvKeyProvider } from '../../ports/adapters/env-key-provider';
import type { EmailPort } from '../../ports/email';

import {
  createOtpService,
  generateOtp,
  hashEmailForKey,
  OTP_MIN_RESPONSE_MS,
  otpKey,
  safeEqual,
} from './otp.service';

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

const fakeKeys = () =>
  new EnvKeyProvider(randomBytes(32), randomBytes(32));

const fakeEmail = (): EmailPort => ({
  send: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
});

const okRateLimiter = (): RateLimiter => ({
  multiplier: 1,
  consume: vi.fn().mockResolvedValue(undefined),
});

/** Simple in-memory valkey stub sufficient for OTP service tests. */
const fakeValkey = () => {
  const store = new Map<string, Record<string, string>>();
  return {
    hset: vi.fn(async (key: string, fields: Record<string, string | number>) => {
      store.set(key, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])));
      return 1;
    }),
    expire: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn(async (key: string) => store.get(key) ?? {}),
    hincrby: vi.fn(async (key: string, field: string, delta: number) => {
      const rec = store.get(key) ?? {};
      const next = (parseInt(rec[field] ?? '0', 10)) + delta;
      store.set(key, { ...rec, [field]: String(next) });
      return next;
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  } as unknown as Redis;
};

describe('OTP helpers', () => {
  it('generates 6-digit codes with leading zeros preserved', () => {
    const codes = Array.from({ length: 500 }, generateOtp);

    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(400);
  });

  it('keys the store by a hashed email and the nonce', () => {
    expect(otpKey('a@b.c', 'n1')).toBe(`otp:${hashEmailForKey('a@b.c')}:n1`);
    expect(otpKey('a@b.c', 'n1')).not.toContain('a@b.c');
    expect(hashEmailForKey('a@b.c')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('compares digests in constant time and rejects length mismatches', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('OTP service — timing and rate-limiting', () => {
  it('issue: padResponse still runs when the rate limiter rejects (≥250 ms enforced)', async () => {
    const nowValue = 0;
    const sleepDelays: number[] = [];

    const rateLimiter: RateLimiter = {
      multiplier: 1,
      consume: vi.fn().mockRejectedValue(new RateLimitedError(60)),
    };

    const svc = createOtpService({
      valkey: fakeValkey(),
      keys: fakeKeys(),
      email: fakeEmail(),
      rateLimiter,
      now: () => nowValue,
      sleep: async (ms) => {
        sleepDelays.push(ms);
      },
    });

    await expect(svc.issue('user@example.com', '1.2.3.4')).rejects.toThrow();
    // padResponse should have been called — sleepDelays will have ≥1 entry if elapsed < 250ms
    expect(sleepDelays.length).toBeGreaterThanOrEqual(1);
    expect(sleepDelays[0]).toBeGreaterThanOrEqual(OTP_MIN_RESPONSE_MS);
  });

  it('issue: padResponse still runs when SMTP fails (≥250 ms enforced)', async () => {
    const nowValue = 0;
    const sleepDelays: number[] = [];

    const brokenEmail: EmailPort = {
      send: vi.fn().mockRejectedValue(new Error('SMTP connection refused')),
    };

    const svc = createOtpService({
      valkey: fakeValkey(),
      keys: fakeKeys(),
      email: brokenEmail,
      rateLimiter: okRateLimiter(),
      now: () => nowValue,
      sleep: async (ms) => {
        sleepDelays.push(ms);
      },
    });

    await expect(svc.issue('user@example.com', '1.2.3.4')).rejects.toThrow('SMTP connection refused');
    expect(sleepDelays.length).toBeGreaterThanOrEqual(1);
    expect(sleepDelays[0]).toBeGreaterThanOrEqual(OTP_MIN_RESPONSE_MS);
  });

  it('verify: throws RATE_LIMITED when the per-IP limit is exhausted', async () => {
    const rateLimiter: RateLimiter = {
      multiplier: 1,
      consume: vi.fn().mockRejectedValue(new RateLimitedError(120)),
    };

    const svc = createOtpService({
      valkey: fakeValkey(),
      keys: fakeKeys(),
      email: fakeEmail(),
      rateLimiter,
    });

    await expect(
      svc.verify('user@example.com', 'some-nonce', '123456', '1.2.3.4'),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
