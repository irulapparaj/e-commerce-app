import { randomBytes } from 'node:crypto';

import { validateRedirect } from '@pe/shared';
import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { refreshSession } from '@/lib/auth/bff';
import { applyCookies, COOKIE_NAMES, sessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { getWebEnv } from '@/lib/env';
import {
  type HeaderOptions,
  NONCE_HEADER,
  securityHeaders,
  type Surface,
  surfaceForPath,
} from '@/lib/security-headers';

import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const ADMIN_LOGIN_PATH = '/admin/login';
const CUSTOMER_LOGIN_PATH = '/login';
const PROTECTED_STOREFRONT = [/^\/checkout(\/|$)/, /^\/account(\/|$)/];
const NONCE_BYTES = 16;

const stripLocale = (pathname: string): string => {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
};

const sessionFor = (request: NextRequest) => {
  const env = getWebEnv();
  return verifyAccessToken(
    request.cookies.get(COOKIE_NAMES.access)?.value,
    env.JWT_PUBLIC_KEYS_JSON,
    env.JWT_ISSUER,
  );
};

/**
 * A3: Attempt a silent token refresh when the access token is expired/absent but a refresh
 * token cookie is still present. Returns the new session tokens on success or null if the
 * refresh token is missing or has been revoked.
 */
const trySilentRefresh = async (request: NextRequest) => {
  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value;
  if (refreshToken === undefined) return null;
  const result = await refreshSession(refreshToken, request);
  return result.tokens;
};

/** Copies the incoming headers and adds the nonce so server components can read it via `headers()`. */
const withNonce = (request: NextRequest, nonce: string): NextRequest => {
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  return new NextRequest(request, { headers });
};

const applySecurityHeaders = (
  response: NextResponse,
  surface: Surface,
  nonce: string,
  options: HeaderOptions,
): NextResponse => {
  for (const [name, value] of Object.entries(securityHeaders(surface, nonce, options)))
    response.headers.set(name, value);
  return response;
};

const route = async (request: NextRequest, forwarded: NextRequest): Promise<NextResponse> => {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname === ADMIN_LOGIN_PATH)
      return NextResponse.next({ request: { headers: forwarded.headers } });
    const session = await sessionFor(request);
    if (session !== null && session.aud === 'admin')
      return NextResponse.next({ request: { headers: forwarded.headers } });
    // Access token expired (not merely wrong audience): attempt a silent refresh.
    if (session === null) {
      const refreshed = await trySilentRefresh(request);
      if (refreshed !== null) {
        const response = NextResponse.next({ request: { headers: forwarded.headers } });
        return applyCookies(response, sessionCookies(refreshed));
      }
    }
    return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
  }

  const path = stripLocale(pathname);
  if (PROTECTED_STOREFRONT.some((pattern) => pattern.test(path))) {
    const session = await sessionFor(request);
    if (session === null || session.aud !== 'storefront') {
      // Access token expired (not merely wrong audience): attempt a silent refresh.
      if (session === null) {
        const refreshed = await trySilentRefresh(request);
        if (refreshed !== null) {
          // Let intl middleware handle locale redirects; attach new session cookies.
          return applyCookies(intlMiddleware(forwarded) as NextResponse, sessionCookies(refreshed));
        }
      }
      const target = validateRedirect(`${path}${search}`, '/account');
      const login = new URL(CUSTOMER_LOGIN_PATH, request.url);
      login.searchParams.set('redirect', target);
      return NextResponse.redirect(login);
    }
  }

  return intlMiddleware(forwarded);
};

/**
 * R13: `/admin/**` needs aud=admin; `/checkout` and `/account/**` need a storefront session.
 * Every response, including redirects, carries the §11.3 headers with a per-request CSP nonce;
 * `/admin` gets the Razorpay-free admin CSP.
 */
export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const env = getWebEnv();
  const nonce = randomBytes(NONCE_BYTES).toString('base64');
  const surface = surfaceForPath(request.nextUrl.pathname);
  const options: HeaderOptions = {
    ...(env.NEXT_PUBLIC_MEDIA_HOST === undefined
      ? {}
      : { mediaOrigin: env.NEXT_PUBLIC_MEDIA_HOST }),
    isDevelopment: env.NODE_ENV === 'development',
  };
  const response = await route(request, withNonce(request, nonce));
  return applySecurityHeaders(response, surface, nonce, options);
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
