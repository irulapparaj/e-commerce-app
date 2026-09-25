import { type NextRequest, NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import {
  buildUpstreamHeaders,
  buildUpstreamUrl,
  filterResponseHeaders,
  methodHasBody,
} from '@/lib/proxy';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ path: string[] }>;
}

/**
 * Generic BFF proxy (R1). Forwards the request to the private API without cookies; P03 adds
 * Bearer injection, CSRF enforcement and the 401 → refresh → retry step.
 */
const proxy = async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  const env = getWebEnv();
  const { path } = await context.params;
  const url = buildUpstreamUrl(env.API_INTERNAL_URL, path, request.nextUrl.search);
  const forwardedFor = request.headers.get('x-forwarded-for');
  const headers = buildUpstreamHeaders(
    request.headers,
    forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  );

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: methodHasBody(request.method) ? request.body : null,
    // @ts-expect-error -- `duplex` is required by undici for streamed bodies but missing from the DOM types
    duplex: 'half',
    redirect: 'manual',
    cache: 'no-store',
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: filterResponseHeaders(upstream.headers),
  });
};

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
