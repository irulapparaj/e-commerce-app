import { DEFAULT_REDIRECT } from '@pe/shared';
import { type NextRequest, NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';

import { callApi } from './api-client';
import {
  accessCookie,
  applyCookies,
  clearedMfaCookie,
  clearedSessionCookies,
  COOKIE_NAMES,
  mfaCookie,
  type SessionAudience,
  sessionCookies,
} from './cookies';
import { checkCsrf, checkSameOrigin } from './csrf';
import { csrfFailure, jsonError, jsonOk } from './responses';

interface SessionPayload {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly audience: SessionAudience;
  readonly user: { readonly id: string; readonly email: string; readonly role: string };
}

interface MfaPayload {
  readonly mfaRequired?: true;
  readonly mfaEnrolmentRequired?: true;
  readonly mfaToken: string;
}

type VerifyOtpPayload = SessionPayload | MfaPayload;

const isSessionPayload = (payload: VerifyOtpPayload): payload is SessionPayload =>
  'accessToken' in payload;

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const cookie = (request: NextRequest, name: string): string | undefined =>
  request.cookies.get(name)?.value;

/** Same-origin only: before login there is no csrf cookie to double-submit. */
const guardSameOrigin = (request: NextRequest): NextResponse | null => {
  const result = checkSameOrigin(request.headers, getWebEnv().WEB_ORIGIN);
  return result.ok ? null : csrfFailure(result.reason);
};

/** Same-origin plus double-submit for every state change once a session exists. */
const guardCsrf = (request: NextRequest): NextResponse | null => {
  const result = checkCsrf(
    request.headers,
    getWebEnv().WEB_ORIGIN,
    cookie(request, COOKIE_NAMES.csrf),
  );
  return result.ok ? null : csrfFailure(result.reason);
};

const passthrough = <T>(status: number, body: unknown): NextResponse =>
  NextResponse.json(body as T, { status });

export const sendOtp = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardSameOrigin(request);
  if (blocked !== null) return blocked;
  const result = await callApi<{ nonce: string }>('/auth/send-otp', {
    body: await readJson(request),
    forwardFrom: request,
  });
  return passthrough(result.status, result.body);
};

export const verifyOtp = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardSameOrigin(request);
  if (blocked !== null) return blocked;
  const result = await callApi<VerifyOtpPayload>('/auth/verify-otp', {
    body: await readJson(request),
    forwardFrom: request,
  });
  if (!result.body.success) return passthrough(result.status, result.body);
  const payload = result.body.data;
  if (!isSessionPayload(payload)) {
    const response = jsonOk({
      mfaRequired: payload.mfaRequired === true,
      mfaEnrolmentRequired: payload.mfaEnrolmentRequired === true,
    });
    return applyCookies(response, [mfaCookie(payload.mfaToken)]);
  }
  const response = jsonOk({ user: payload.user, redirect: DEFAULT_REDIRECT.customer });
  return applyCookies(response, sessionCookies(payload));
};

const mfaBearer = (request: NextRequest): string | NextResponse => {
  const token = cookie(request, COOKIE_NAMES.mfa);
  return token === undefined ? jsonError(401, 'UNAUTHENTICATED', 'Start the sign-in again') : token;
};

export const mfaEnrol = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardSameOrigin(request);
  if (blocked !== null) return blocked;
  const bearer = mfaBearer(request);
  if (bearer instanceof NextResponse) return bearer;
  const result = await callApi<unknown>('/auth/mfa/enrol', { bearer, forwardFrom: request });
  return passthrough(result.status, result.body);
};

export const mfaVerify = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardSameOrigin(request);
  if (blocked !== null) return blocked;
  const bearer = mfaBearer(request);
  if (bearer instanceof NextResponse) return bearer;
  const result = await callApi<SessionPayload>('/auth/mfa/verify', {
    body: await readJson(request),
    bearer,
    forwardFrom: request,
  });
  if (!result.body.success) return passthrough(result.status, result.body);
  const response = jsonOk({ user: result.body.data.user, redirect: DEFAULT_REDIRECT.admin });
  return applyCookies(response, [...sessionCookies(result.body.data), clearedMfaCookie()]);
};

export const refreshSession = async (
  refreshToken: string,
  forwardFrom?: Request,
): Promise<
  { readonly tokens: SessionPayload } | { readonly tokens: null; readonly status: number }
> => {
  const result = await callApi<SessionPayload>('/auth/refresh', {
    body: { refreshToken },
    ...(forwardFrom === undefined ? {} : { forwardFrom }),
  });
  return result.body.success
    ? { tokens: result.body.data }
    : { tokens: null, status: result.status };
};

export const refresh = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardCsrf(request);
  if (blocked !== null) return blocked;
  const token = cookie(request, COOKIE_NAMES.refresh);
  if (token === undefined)
    return applyCookies(jsonError(401, 'UNAUTHENTICATED', 'No session'), clearedSessionCookies());
  const result = await refreshSession(token, request);
  if (result.tokens === null)
    return applyCookies(
      jsonError(401, 'UNAUTHENTICATED', 'Session expired'),
      clearedSessionCookies(),
    );
  return applyCookies(jsonOk({ refreshed: true }), sessionCookies(result.tokens));
};

export const logout = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardCsrf(request);
  if (blocked !== null) return blocked;
  const token = cookie(request, COOKIE_NAMES.refresh);
  if (token !== undefined)
    await callApi('/auth/logout', { body: { refreshToken: token }, forwardFrom: request });
  return applyCookies(jsonOk({ loggedOut: true }), [
    ...clearedSessionCookies(),
    clearedMfaCookie(),
  ]);
};

export const logoutAll = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardCsrf(request);
  if (blocked !== null) return blocked;
  const bearer = cookie(request, COOKIE_NAMES.access);
  const result =
    bearer === undefined
      ? null
      : await callApi<{ revoked: number }>('/auth/logout-all', { bearer, forwardFrom: request });
  const revoked = result?.body.success ? result.body.data.revoked : 0;
  return applyCookies(jsonOk({ revoked }), [...clearedSessionCookies(), clearedMfaCookie()]);
};

export const stepUp = async (request: NextRequest): Promise<NextResponse> => {
  const blocked = guardCsrf(request);
  if (blocked !== null) return blocked;
  const bearer = cookie(request, COOKIE_NAMES.access);
  if (bearer === undefined) return jsonError(401, 'UNAUTHENTICATED', 'No session');
  const result = await callApi<{ accessToken: string; stepUpExp: number }>('/auth/step-up', {
    body: await readJson(request),
    bearer,
    forwardFrom: request,
  });
  if (!result.body.success) return passthrough(result.status, result.body);
  return applyCookies(jsonOk({ stepUpExp: result.body.data.stepUpExp }), [
    accessCookie(result.body.data.accessToken),
  ]);
};
