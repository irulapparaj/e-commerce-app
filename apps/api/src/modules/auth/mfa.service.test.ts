import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EnvKeyProvider } from '../../ports/adapters/env-key-provider';

import { generateRecoveryCode, hashRecoveryCode, RECOVERY_CODE_COUNT } from './mfa.service';
import { RECOVERY_CODE_PATTERN } from './schemas';

describe('recovery codes', () => {
  it('generates xxxx-xxxx codes from an unambiguous alphabet and hashes them case-insensitively', () => {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

    expect(codes.every((code) => RECOVERY_CODE_PATTERN.test(code))).toBe(true);
    expect(codes.join('')).not.toMatch(/[01lio]/);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(hashRecoveryCode(' ABCD-EFGH ')).toBe(hashRecoveryCode('abcd-efgh'));
    expect(hashRecoveryCode('abcd-efgh')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores TOTP secrets only as ciphertext envelopes', () => {
    const keys = new EnvKeyProvider(randomBytes(32), randomBytes(32));
    const secret = 'JBSWY3DPEHPK3PXP';

    expect(keys.encrypt(secret)).toMatch(/^v1:/);
    expect(keys.decrypt(keys.encrypt(secret))).toBe(secret);
  });
});
