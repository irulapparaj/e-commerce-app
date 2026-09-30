import { type ErrorCode, fail, ok } from '@pe/shared';
import { NextResponse } from 'next/server';

export const jsonOk = <T>(data: T, status = 200): NextResponse =>
  NextResponse.json(ok(data), { status });

export const jsonError = (status: number, code: ErrorCode, message: string): NextResponse =>
  NextResponse.json(fail({ code, message }), { status });

export const csrfFailure = (reason: string): NextResponse =>
  jsonError(403, 'FORBIDDEN', `Request blocked (${reason})`);
