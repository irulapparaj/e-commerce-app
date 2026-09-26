import { describe, expect, it } from 'vitest';

import { generateOtp, hashEmailForKey, otpKey, safeEqual } from './otp.service';

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
