import { describe, expect, it } from 'vitest';

import { createStaffBody, mfaVerifyBody, sendOtpBody, verifyOtpBody } from './schemas';

describe('auth schemas', () => {
  it('normalises email and rejects unknown keys', () => {
    expect(sendOtpBody.parse({ email: ' A@B.CO ' })).toEqual({ email: 'a@b.co' });
    expect(sendOtpBody.safeParse({ email: 'a@b.co', extra: 1 }).success).toBe(false);
  });

  it('requires a uuid nonce and a 6-digit otp', () => {
    const valid = { email: 'a@b.co', nonce: '0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d', otp: '012345' };

    expect(verifyOtpBody.safeParse(valid).success).toBe(true);
    expect(verifyOtpBody.safeParse({ ...valid, otp: '12345' }).success).toBe(false);
    expect(verifyOtpBody.safeParse({ ...valid, nonce: 'nope' }).success).toBe(false);
  });

  it('accepts TOTP codes or recovery codes for mfa verification', () => {
    expect(mfaVerifyBody.parse({ code: ' 123456 ' })).toEqual({ code: '123456' });
    expect(mfaVerifyBody.parse({ code: 'ABCD-EFGH' })).toEqual({ code: 'abcd-efgh' });
    expect(mfaVerifyBody.safeParse({ code: 'abc' }).success).toBe(false);
  });

  it('limits staff roles to ADMIN and STAFF', () => {
    expect(createStaffBody.safeParse({ email: 'x@y.zz', name: 'X', role: 'STAFF' }).success).toBe(
      true,
    );
    expect(
      createStaffBody.safeParse({ email: 'x@y.zz', name: 'X', role: 'CUSTOMER' }).success,
    ).toBe(false);
  });
});
