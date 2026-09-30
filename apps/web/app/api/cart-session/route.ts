import { randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';

// Chrome treats http://localhost as a secure origin, but Firefox and WebKit do not.
// The `__Host-` prefix requires HTTPS in Firefox/WebKit, so we fall back to a plain
// cookie name and drop the `Secure` flag in non-production to support local E2E runs.
const IS_PROD = process.env.NODE_ENV === 'production';
const CART_SESSION_COOKIE = IS_PROD ? '__Host-cart' : 'cart-session';
// The access token cookie set by the BFF auth handlers.
const ACCESS_COOKIE_NAME = IS_PROD ? '__Host-access' : '__Host-access';
const SESSION_BYTES = 32;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

const generateSessionId = (): string => randomBytes(SESSION_BYTES).toString('hex');

const apiUrl = (path: string): string => {
  const env = getWebEnv();
  return `${env.API_INTERNAL_URL}/api/v1${path}`;
};

type CartMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const CART_PATH_PREFIX = '/cart';

/** Reject any ?path= that doesn't start with /cart to prevent open relay traversal (BL-09). */
const guardPath = (raw: string | null, fallback: string): string => {
  const path = raw ?? fallback;
  if (!path.startsWith(CART_PATH_PREFIX)) {
    throw new Error(`Disallowed cart-session path: ${path}`);
  }
  return path;
};

/**
 * Forward a cart request to the upstream API.
 * When the user is logged in (bearer is present), the Authorization header is sent so the API
 * associates the cart with the user's keyed cart (`cart:{userId}`) rather than the guest session.
 */
const forwardToApi = async (
  method: CartMethod,
  apiPath: string,
  sessionId: string,
  body?: string,
  contentType?: string | null,
  bearer?: string,
): Promise<Response> =>
  fetch(apiUrl(apiPath), {
    method,
    headers: {
      accept: 'application/json',
      'x-cart-session': sessionId,
      ...(bearer !== undefined ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body !== undefined && contentType ? { 'content-type': contentType } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    cache: 'no-store',
  });

const getOrCreateSession = async (): Promise<{ id: string; isNew: boolean }> => {
  const jar = await cookies();
  const existing = jar.get(CART_SESSION_COOKIE)?.value;
  if (existing) return { id: existing, isNew: false };
  return { id: generateSessionId(), isNew: true };
};

const emptyCartResponse = (): NextResponse =>
  NextResponse.json({
    success: true,
    data: {
      items: [],
      subtotalPaise: 0,
      itemCount: 0,
      coupon: null,
      notices: [],
      freeShipping: { thresholdPaise: 0, remainingPaise: 0, reached: false },
    },
  });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const sessionId = jar.get(CART_SESSION_COOKIE)?.value;
  if (!sessionId) return emptyCartResponse();
  const bearer = jar.get(ACCESS_COOKIE_NAME)?.value;
  let apiPath: string;
  try {
    apiPath = guardPath(request.nextUrl.searchParams.get('path'), '/cart');
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const apiResponse = await forwardToApi('GET', apiPath, sessionId, undefined, undefined, bearer);
  return NextResponse.json(await apiResponse.json(), { status: apiResponse.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { id: sessionId, isNew } = await getOrCreateSession();
  const jar = await cookies();
  const bearer = jar.get(ACCESS_COOKIE_NAME)?.value;
  const body = await request.text();
  let apiPath: string;
  try {
    apiPath = guardPath(request.nextUrl.searchParams.get('path'), '/cart/items');
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const apiResponse = await forwardToApi('POST', apiPath, sessionId, body, request.headers.get('content-type'), bearer);
  const response = NextResponse.json(await apiResponse.json(), { status: apiResponse.status });
  if (isNew) response.cookies.set(CART_SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
  return response;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const sessionId = jar.get(CART_SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: 'No cart session' }, { status: 400 });
  const bearer = jar.get(ACCESS_COOKIE_NAME)?.value;
  const body = await request.text();
  let apiPath: string;
  try {
    apiPath = guardPath(request.nextUrl.searchParams.get('path'), '/cart/items');
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const apiResponse = await forwardToApi('PUT', apiPath, sessionId, body, request.headers.get('content-type'), bearer);
  return NextResponse.json(await apiResponse.json(), { status: apiResponse.status });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const sessionId = jar.get(CART_SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: 'No cart session' }, { status: 400 });
  const bearer = jar.get(ACCESS_COOKIE_NAME)?.value;
  let apiPath: string;
  try {
    apiPath = guardPath(request.nextUrl.searchParams.get('path'), '/cart');
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const apiResponse = await forwardToApi('DELETE', apiPath, sessionId, undefined, undefined, bearer);
  return NextResponse.json(await apiResponse.json(), { status: apiResponse.status });
}

/** Called by the login flow to clear the guest cart cookie. Also call on order completion. */
export async function PATCH(): Promise<NextResponse> {
  const response = NextResponse.json({ cleared: true });
  response.cookies.set(CART_SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
