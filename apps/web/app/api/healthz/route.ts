import { ok } from '@pe/shared';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(ok({ status: 'ok' }));
}
