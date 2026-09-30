import type { NextRequest, NextResponse } from 'next/server';

import { proxyToApi } from '@/lib/auth/proxy-handler';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ path: string[] }>;
}

const proxy = async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  const { path } = await context.params;
  return proxyToApi(request, path);
};

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
