import { describe, expect, it } from 'vitest';

import { isHoneypotFilled } from './honeypot';

describe('isHoneypotFilled', () => {
  it('returns false when website is undefined', () => {
    expect(isHoneypotFilled(undefined)).toBe(false);
  });

  it('returns false when website is empty string', () => {
    expect(isHoneypotFilled('')).toBe(false);
  });

  it('returns true when website has content', () => {
    expect(isHoneypotFilled('https://spambot.example.com')).toBe(true);
  });

  it('returns true for a single space (bot fill)', () => {
    expect(isHoneypotFilled(' ')).toBe(true);
  });
});
