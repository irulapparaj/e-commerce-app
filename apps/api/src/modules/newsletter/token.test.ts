import { describe, expect, it } from 'vitest';

import { generateUnsubscribeToken, verifyUnsubscribeToken } from './token';

describe('generateUnsubscribeToken', () => {
  it('returns a 43-character base64url string', () => {
    const token = generateUnsubscribeToken();
    expect(token).toHaveLength(43);
    // base64url alphabet: A-Z, a-z, 0-9, -, _  (no + or /)
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('returns a different token on each call', () => {
    const a = generateUnsubscribeToken();
    const b = generateUnsubscribeToken();
    expect(a).not.toBe(b);
  });
});

describe('verifyUnsubscribeToken', () => {
  it('returns true when candidate matches stored token', () => {
    const token = generateUnsubscribeToken();
    expect(verifyUnsubscribeToken(token, token)).toBe(true);
  });

  it('returns false when candidate does not match stored token', () => {
    const a = generateUnsubscribeToken();
    const b = generateUnsubscribeToken();
    expect(verifyUnsubscribeToken(a, b)).toBe(false);
  });

  it('returns false for an empty candidate', () => {
    const stored = generateUnsubscribeToken();
    expect(verifyUnsubscribeToken('', stored)).toBe(false);
  });

  it('returns false for an empty stored token', () => {
    const candidate = generateUnsubscribeToken();
    expect(verifyUnsubscribeToken(candidate, '')).toBe(false);
  });

  it('returns false for a token of the wrong length', () => {
    const stored = generateUnsubscribeToken();
    expect(verifyUnsubscribeToken('short', stored)).toBe(false);
  });
});
