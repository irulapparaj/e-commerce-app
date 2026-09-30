import { describe, expect, it } from 'vitest';

import { DEFAULT_REDIRECT, isSafeRedirect, validateRedirect } from './redirect';

describe('validateRedirect', () => {
  it.each([
    ['/account', '/account'],
    ['/checkout?x=1', '/checkout?x=1'],
    ['/account/orders/abc-123?page=2&sort=asc', '/account/orders/abc-123?page=2&sort=asc'],
    ['/products/royale-masala%20agarbatti', '/products/royale-masala%20agarbatti'],
  ])('accepts %s', (input, expected) => {
    expect(validateRedirect(input, '/fallback')).toBe(expected);
    expect(isSafeRedirect(input)).toBe(true);
  });

  it.each([
    ['//evil.com'],
    ['/\\evil'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['/a@b'],
    [''],
    ['account'],
    ['/path with space'],
    ['/path#frag'],
    [null],
    [undefined],
    [42],
  ])('falls back for %j', (input) => {
    expect(validateRedirect(input, DEFAULT_REDIRECT.customer)).toBe('/account');
    expect(isSafeRedirect(input)).toBe(false);
  });
});
