import { describe, expect, it } from 'vitest';

import { checkCsrf, checkDoubleSubmit, checkSameOrigin, CSRF_HEADER } from './csrf';

const ORIGIN = 'http://localhost:3000';

describe('checkSameOrigin', () => {
  it.each([
    [{ 'sec-fetch-site': 'same-origin' }, true],
    [{ 'sec-fetch-site': 'none' }, true],
    [{ 'sec-fetch-site': 'cross-site' }, false],
    [{ 'sec-fetch-site': 'same-site' }, false],
    [{ 'sec-fetch-site': 'cross-site', origin: ORIGIN }, false],
    [{ origin: ORIGIN }, true],
    [{ origin: 'http://evil.example' }, false],
    [{}, false],
  ])('%j → %s', (headers, ok) => {
    expect(checkSameOrigin(new Headers(headers), ORIGIN).ok).toBe(ok);
  });
});

describe('checkDoubleSubmit', () => {
  it('requires the header to equal the cookie', () => {
    expect(checkDoubleSubmit(new Headers({ [CSRF_HEADER]: 'abc' }), 'abc')).toEqual({ ok: true });
    expect(checkDoubleSubmit(new Headers({ [CSRF_HEADER]: 'abd' }), 'abc')).toEqual({
      ok: false,
      reason: 'token-mismatch',
    });
    expect(checkDoubleSubmit(new Headers({ [CSRF_HEADER]: 'abcd' }), 'abc')).toEqual({
      ok: false,
      reason: 'token-mismatch',
    });
    expect(checkDoubleSubmit(new Headers(), 'abc')).toEqual({ ok: false, reason: 'token-missing' });
    expect(checkDoubleSubmit(new Headers({ [CSRF_HEADER]: 'abc' }), undefined)).toEqual({
      ok: false,
      reason: 'token-missing',
    });
    expect(checkDoubleSubmit(new Headers({ [CSRF_HEADER]: '' }), '')).toEqual({
      ok: false,
      reason: 'token-missing',
    });
  });
});

describe('checkCsrf', () => {
  it('rejects cross-site before looking at tokens and passes same-origin double-submit', () => {
    expect(
      checkCsrf(
        new Headers({ 'sec-fetch-site': 'cross-site', [CSRF_HEADER]: 'abc' }),
        ORIGIN,
        'abc',
      ),
    ).toEqual({ ok: false, reason: 'cross-site' });
    expect(
      checkCsrf(
        new Headers({ 'sec-fetch-site': 'same-origin', [CSRF_HEADER]: 'abc' }),
        ORIGIN,
        'abc',
      ),
    ).toEqual({ ok: true });
    expect(
      checkCsrf(
        new Headers({ origin: 'http://evil.example', [CSRF_HEADER]: 'abc' }),
        ORIGIN,
        'abc',
      ),
    ).toEqual({ ok: false, reason: 'origin-mismatch' });
  });
});
