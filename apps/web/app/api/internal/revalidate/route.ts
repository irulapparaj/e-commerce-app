import { revalidateTag } from 'next/cache';
import type { NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';
import { handleRevalidate } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export const POST = (request: Request): Promise<NextResponse> =>
  handleRevalidate(request, { secret: getWebEnv().REVALIDATE_SECRET, revalidateTag });
