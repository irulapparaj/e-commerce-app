import { describe, expect, it } from 'vitest';

import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'test-hmac-secret-for-unsubscribe-32chars';
const EMAIL_HASH = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1';
const NOW_SECONDS = 1_700_000_000;

describe('signUnsubscribeToken', () => {
  it('returns a token with two parts separated by a dot', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });

  it('encodes the emailHash and purpose in the payload', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const encoded = token.split('.')[0] ?? '';
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      emailHash: string;
      purpose: string;
      exp: number;
    };
    expect(payload.emailHash).toBe(EMAIL_HASH);
    expect(payload.purpose).toBe('newsletter');
    expect(payload.exp).toBe(NOW_SECONDS + 30 * 24 * 60 * 60);
  });
});

describe('verifyUnsubscribeToken', () => {
  it('returns ok=true with the payload for a valid token', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const result = verifyUnsubscribeToken(token, SECRET, NOW_SECONDS + 60);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.emailHash).toBe(EMAIL_HASH);
      expect(result.payload.purpose).toBe('newsletter');
    }
  });

  it('returns ok=false for an expired token', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const expiredNow = NOW_SECONDS + 31 * 24 * 60 * 60; // 31 days later
    const result = verifyUnsubscribeToken(token, SECRET, expiredNow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('token expired');
    }
  });

  it('returns ok=false when the signature is tampered', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const tampered = token.slice(0, -4) + 'XXXX';
    const result = verifyUnsubscribeToken(tampered, SECRET, NOW_SECONDS + 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid signature');
    }
  });

  it('returns ok=false for a malformed token with no dot', () => {
    const result = verifyUnsubscribeToken('nodothere', SECRET, NOW_SECONDS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed token');
    }
  });

  it('returns ok=false when using the wrong secret', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    const result = verifyUnsubscribeToken(token, 'different-secret-32-chars-long!!!', NOW_SECONDS + 60);
    expect(result.ok).toBe(false);
  });

  it('is timing-safe: tokens with different lengths return false', () => {
    const token = signUnsubscribeToken(EMAIL_HASH, SECRET, NOW_SECONDS);
    // Replace the signature part with something of different length
    const parts = token.split('.');
    const badToken = `${parts[0] ?? ''}.abc`;
    const result = verifyUnsubscribeToken(badToken, SECRET, NOW_SECONDS + 60);
    expect(result.ok).toBe(false);
  });
});
