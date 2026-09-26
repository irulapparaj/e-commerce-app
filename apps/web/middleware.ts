import { validateRedirect } from '@pe/shared';
import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { COOKIE_NAMES } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { getWebEnv } from '@/lib/env';

import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const ADMIN_LOGIN_PATH = '/admin/login';
const CUSTOMER_LOGIN_PATH = '/login';
const PROTECTED_STOREFRONT = [/^\/checkout(\/|$)/, /^\/account(\/|$)/];

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

/** R13: `/admin/**` needs aud=admin; `/checkout` and `/account/**` need a storefront session. */
export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname === ADMIN_LOGIN_PATH) return NextResponse.next();
    const session = await sessionFor(request);
    if (session === null || session.aud !== 'admin')
      return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
    return NextResponse.next();
  }

  const path = stripLocale(pathname);
  if (PROTECTED_STOREFRONT.some((pattern) => pattern.test(path))) {
    const session = await sessionFor(request);
    if (session === null || session.aud !== 'storefront') {
      const target = validateRedirect(`${path}${search}`, '/account');
      const login = new URL(CUSTOMER_LOGIN_PATH, request.url);
      login.searchParams.set('redirect', target);
      return NextResponse.redirect(login);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
