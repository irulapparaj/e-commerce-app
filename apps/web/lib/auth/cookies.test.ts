import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';

import {
  accessCookie,
  applyCookies,
  clearedMfaCookie,
  clearedSessionCookies,
  COOKIE_NAMES,
  cookieAttributes,
  mfaCookie,
  sessionCookies,
} from './cookies';

const tokens = {
  accessToken: 'at',
  refreshToken: 'rt',
  csrfToken: 'ct',
  audience: 'storefront' as const,
};

describe('session cookies', () => {
  it('sets exactly three __Host- cookies with the DESIGN §11.3 attributes', () => {
    const specs = sessionCookies(tokens).map(cookieAttributes);

    expect(specs.map((c) => c.name)).toEqual(['__Host-access', '__Host-refresh', '__Host-csrf']);
    expect(specs.every((c) => c.secure && c.sameSite === 'lax' && c.path === '/')).toBe(true);
    expect(specs.every((c) => c.name.startsWith('__Host-'))).toBe(true);
    expect(specs.map((c) => c.httpOnly)).toEqual([true, true, false]);
    expect(specs.map((c) => c.maxAge)).toEqual([900, 30 * 24 * 3600, 30 * 24 * 3600]);
    expect(Object.keys(specs[0] ?? {})).not.toContain('domain');
  });

  it('uses the 8 hour refresh lifetime for admin sessions and 5 minutes for the mfa cookie', () => {
    const admin = sessionCookies({ ...tokens, audience: 'admin' });

    expect(admin[1]?.maxAge).toBe(8 * 3600);
    expect(mfaCookie('mt')).toEqual({
      name: COOKIE_NAMES.mfa,
      value: 'mt',
      httpOnly: true,
      maxAge: 300,
    });
    expect(accessCookie('x')).toMatchObject({
      name: COOKIE_NAMES.access,
      httpOnly: true,
      maxAge: 900,
    });
  });

  it('clears cookies with maxAge 0 and writes Set-Cookie headers on a response', () => {
    const response = applyCookies(NextResponse.json({}), [
      ...clearedSessionCookies(),
      clearedMfaCookie(),
    ]);
    const header = response.headers.get('set-cookie') ?? '';

    expect(clearedSessionCookies().every((c) => c.maxAge === 0 && c.value === '')).toBe(true);
    expect(header).toContain('__Host-access=;');
    expect(header).toContain('__Host-mfa=;');
    expect(header).toMatch(/Max-Age=0/);
  });

  it('serialises attributes into Set-Cookie', () => {
    const response = applyCookies(NextResponse.json({}), sessionCookies(tokens));
    const cookies = response.cookies.getAll();

    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toMatchObject({
      name: '__Host-access',
      value: 'at',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(cookies[2]).toMatchObject({ name: '__Host-csrf', httpOnly: false });
  });
});
