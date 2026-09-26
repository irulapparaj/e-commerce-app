import { describe, expect, it } from 'vitest';

import {
  absoluteExpiry,
  decideRotation,
  generateRawToken,
  hashToken,
  REFRESH_TTL,
} from './refresh-state';

const base = new Date('2026-09-25T10:00:00Z');
const at = (offsetMs: number) => new Date(base.getTime() + offsetMs);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('decideRotation', () => {
  it('rotates a live token', () => {
    const record = {
      audience: 'STOREFRONT' as const,
      expiresAt: at(30 * DAY),
      lastUsedAt: base,
      revokedAt: null,
    };

    expect(decideRotation(record, at(DAY))).toEqual({ action: 'rotate' });
  });

  it('revokes the whole family when a rotated token is presented again', () => {
    const record = {
      audience: 'STOREFRONT' as const,
      expiresAt: at(30 * DAY),
      lastUsedAt: base,
      revokedAt: at(1),
    };

    expect(decideRotation(record, at(2))).toEqual({ action: 'revoke-family', reason: 'reuse' });
  });

  it('revokes on absolute expiry and on idle expiry per audience', () => {
    const storefront = {
      audience: 'STOREFRONT' as const,
      expiresAt: at(30 * DAY),
      lastUsedAt: base,
      revokedAt: null,
    };
    const admin = {
      audience: 'ADMIN' as const,
      expiresAt: at(8 * HOUR),
      lastUsedAt: base,
      revokedAt: null,
    };

    expect(decideRotation(storefront, at(30 * DAY))).toEqual({
      action: 'revoke',
      reason: 'expired',
    });
    expect(decideRotation(storefront, at(7 * DAY + 1))).toEqual({
      action: 'revoke',
      reason: 'idle',
    });
    expect(decideRotation(storefront, at(7 * DAY))).toEqual({ action: 'rotate' });
    expect(decideRotation(admin, at(31 * 60_000))).toEqual({ action: 'revoke', reason: 'idle' });
    expect(decideRotation(admin, at(8 * HOUR))).toEqual({ action: 'revoke', reason: 'expired' });
    expect(decideRotation(admin, at(29 * 60_000))).toEqual({ action: 'rotate' });
  });

  it('prefers reuse detection over expiry', () => {
    const record = {
      audience: 'ADMIN' as const,
      expiresAt: base,
      lastUsedAt: base,
      revokedAt: base,
    };

    expect(decideRotation(record, at(DAY))).toEqual({ action: 'revoke-family', reason: 'reuse' });
  });
});

describe('token material', () => {
  it('generates 256-bit base64url tokens and stores only SHA-256 hashes', () => {
    const raw = generateRawToken();

    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(generateRawToken()).not.toBe(raw);
  });

  it('computes absolute expiry per audience', () => {
    expect(absoluteExpiry('STOREFRONT', base).getTime() - base.getTime()).toBe(
      REFRESH_TTL.STOREFRONT.absoluteMs,
    );
    expect(absoluteExpiry('ADMIN', base).getTime() - base.getTime()).toBe(8 * HOUR);
  });
});
