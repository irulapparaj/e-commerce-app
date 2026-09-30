import type { NextResponse } from 'next/server';

export const COOKIE_NAMES = {
  access: '__Host-access',
  refresh: '__Host-refresh',
  csrf: '__Host-csrf',
  mfa: '__Host-mfa',
} as const;

export type SessionAudience = 'storefront' | 'admin';

export const ACCESS_MAX_AGE_SECONDS = 900;
export const MFA_MAX_AGE_SECONDS = 300;
export const REFRESH_MAX_AGE_SECONDS: Readonly<Record<SessionAudience, number>> = {
  storefront: 30 * 24 * 3600,
  admin: 8 * 3600,
};

export interface CookieSpec {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: boolean;
  readonly maxAge: number;
}

export interface CookieAttributes extends CookieSpec {
  readonly secure: true;
  readonly sameSite: 'lax';
  readonly path: '/';
}

/**
 * `__Host-` cookies must be Secure with Path=/ and no Domain (DESIGN §11.3). Browsers treat
 * http://localhost as a secure context, so Secure stays on in development too; use `localhost`,
 * not 127.0.0.1, for the dev server.
 */
export const cookieAttributes = (spec: CookieSpec): CookieAttributes => ({
  ...spec,
  secure: true,
  sameSite: 'lax',
  path: '/',
});

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly audience: SessionAudience;
}

export const sessionCookies = ({
  accessToken,
  refreshToken,
  csrfToken,
  audience,
}: SessionTokens): readonly CookieSpec[] => [
  { name: COOKIE_NAMES.access, value: accessToken, httpOnly: true, maxAge: ACCESS_MAX_AGE_SECONDS },
  {
    name: COOKIE_NAMES.refresh,
    value: refreshToken,
    httpOnly: true,
    maxAge: REFRESH_MAX_AGE_SECONDS[audience],
  },
  {
    name: COOKIE_NAMES.csrf,
    value: csrfToken,
    httpOnly: false,
    maxAge: REFRESH_MAX_AGE_SECONDS[audience],
  },
];

export const accessCookie = (accessToken: string): CookieSpec => ({
  name: COOKIE_NAMES.access,
  value: accessToken,
  httpOnly: true,
  maxAge: ACCESS_MAX_AGE_SECONDS,
});

export const mfaCookie = (mfaToken: string): CookieSpec => ({
  name: COOKIE_NAMES.mfa,
  value: mfaToken,
  httpOnly: true,
  maxAge: MFA_MAX_AGE_SECONDS,
});

const cleared = (name: string, httpOnly: boolean): CookieSpec => ({
  name,
  value: '',
  httpOnly,
  maxAge: 0,
});

export const clearedSessionCookies = (): readonly CookieSpec[] => [
  cleared(COOKIE_NAMES.access, true),
  cleared(COOKIE_NAMES.refresh, true),
  cleared(COOKIE_NAMES.csrf, false),
];

export const clearedMfaCookie = (): CookieSpec => cleared(COOKIE_NAMES.mfa, true);

export const applyCookies = <R extends NextResponse>(
  response: R,
  specs: readonly CookieSpec[],
): R => {
  for (const spec of specs) response.cookies.set(cookieAttributes(spec));
  return response;
};
