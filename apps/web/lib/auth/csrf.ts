import { timingSafeEqual } from 'node:crypto';

import { CSRF_HEADER } from './csrf-constants';

export { CSRF_HEADER } from './csrf-constants';

export type CsrfResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'cross-site' | 'origin-mismatch' | 'token-missing' | 'token-mismatch';
    };

const SAME_ORIGIN_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin', 'none']);

/** Browsers send Sec-Fetch-Site; fall back to an exact Origin match for clients that do not. */
export const checkSameOrigin = (headers: Headers, webOrigin: string): CsrfResult => {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite !== null)
    return SAME_ORIGIN_FETCH_SITES.has(fetchSite)
      ? { ok: true }
      : { ok: false, reason: 'cross-site' };
  const origin = headers.get('origin');
  return origin !== null && origin === webOrigin
    ? { ok: true }
    : { ok: false, reason: 'origin-mismatch' };
};

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Double submit: the X-CSRF-Token header must equal the readable `__Host-csrf` cookie. */
export const checkDoubleSubmit = (
  headers: Headers,
  cookieToken: string | undefined,
): CsrfResult => {
  const header = headers.get(CSRF_HEADER);
  if (cookieToken === undefined || cookieToken === '' || header === null)
    return { ok: false, reason: 'token-missing' };
  return safeEqual(header, cookieToken) ? { ok: true } : { ok: false, reason: 'token-mismatch' };
};

export const checkCsrf = (
  headers: Headers,
  webOrigin: string,
  cookieToken: string | undefined,
): CsrfResult => {
  const origin = checkSameOrigin(headers, webOrigin);
  return origin.ok ? checkDoubleSubmit(headers, cookieToken) : origin;
};
