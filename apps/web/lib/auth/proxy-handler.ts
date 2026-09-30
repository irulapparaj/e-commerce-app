import { createHash } from 'node:crypto';

import { type NextRequest, NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import {
  buildUpstreamHeaders,
  buildUpstreamUrl,
  filterResponseHeaders,
  methodHasBody,
} from '@/lib/proxy';

import { refreshSession } from './bff';
import {
  applyCookies,
  clearedSessionCookies,
  COOKIE_NAMES,
  sessionCookies,
  type SessionAudience,
} from './cookies';
import { checkCsrf, checkSameOrigin } from './csrf';
import { csrfFailure } from './responses';

interface RefreshedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly audience: SessionAudience;
}

/** Single-flight refresh per refresh cookie so parallel proxied calls never trigger reuse detection. */
const inflight = new Map<string, Promise<RefreshedTokens | null>>();

const refreshOnce = (refreshToken: string, request: Request): Promise<RefreshedTokens | null> => {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const existing = inflight.get(key);
  if (existing !== undefined) return existing;
  const attempt = refreshSession(refreshToken, request)
    .then((result) => result.tokens)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, attempt);
  return attempt;
};

const csrfGuard = (request: NextRequest, webOrigin: string): NextResponse | null => {
  if (!methodHasBody(request.method)) return null;
  const csrfCookie = request.cookies.get(COOKIE_NAMES.csrf)?.value;
  const result =
    csrfCookie === undefined
      ? checkSameOrigin(request.headers, webOrigin)
      : checkCsrf(request.headers, webOrigin, csrfCookie);
  return result.ok ? null : csrfFailure(result.reason);
};

const forward = async (
  request: NextRequest,
  url: string,
  body: ArrayBuffer | null,
  bearer: string | undefined,
): Promise<Response> => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const headers = buildUpstreamHeaders(request.headers, {
    ...(forwardedFor === null ? {} : { 'x-forwarded-for': forwardedFor }),
    ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
  });
  return fetch(url, {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  });
};

/**
 * Generic BFF proxy (R1, P03 task 10): CSRF on state changes, Bearer from `__Host-access`,
 * one 401 → refresh → retry, cookies stripped in both directions.
 */
export const proxyToApi = async (
  request: NextRequest,
  path: readonly string[],
): Promise<NextResponse> => {
  const env = getWebEnv();
  const blocked = csrfGuard(request, env.WEB_ORIGIN);
  if (blocked !== null) return blocked;

  const url = buildUpstreamUrl(env.API_INTERNAL_URL, path, request.nextUrl.search);
  const body = methodHasBody(request.method) ? await request.arrayBuffer() : null;
  const access = request.cookies.get(COOKIE_NAMES.access)?.value;
  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value;

  const first = await forward(request, url, body, access);
  if (first.status !== 401 || refreshToken === undefined) {
    return new NextResponse(first.body, {
      status: first.status,
      headers: filterResponseHeaders(first.headers),
    });
  }

  const refreshed = await refreshOnce(refreshToken, request);
  if (refreshed === null) {
    const response = new NextResponse(first.body, {
      status: 401,
      headers: filterResponseHeaders(first.headers),
    });
    return applyCookies(response, clearedSessionCookies());
  }
  const retried = await forward(request, url, body, refreshed.accessToken);
  const response = new NextResponse(retried.body, {
    status: retried.status,
    headers: filterResponseHeaders(retried.headers),
  });
  return applyCookies(response, sessionCookies(refreshed));
};
