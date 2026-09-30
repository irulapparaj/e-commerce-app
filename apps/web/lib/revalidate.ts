import { timingSafeEqual } from 'node:crypto';

import { fail, ok } from '@pe/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret';
/** `home`, `categories`, `search`, `product:{slug}`, `category:{slug}` (P04 task 10). */
export const TAG_PATTERN = /^[a-z]+(?::[a-z0-9-]{1,120})?$/;
const MAX_TAGS = 50;

export const revalidateBodySchema = z.strictObject({
  tags: z.array(z.string().regex(TAG_PATTERN)).min(1).max(MAX_TAGS),
});

/** Constant-time comparison; length is compared first without leaking anything beyond inequality. */
export const isValidRevalidateSecret = (provided: string | null, expected: string): boolean => {
  if (provided === null || provided.length === 0 || expected.length === 0) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface RevalidateDeps {
  readonly secret: string;
  readonly revalidateTag: (tag: string) => void;
}

/** Route handler body for `POST /api/internal/revalidate`; called by the API's revalidate job. */
export const handleRevalidate = async (
  request: Request,
  deps: RevalidateDeps,
): Promise<NextResponse> => {
  if (!isValidRevalidateSecret(request.headers.get(REVALIDATE_SECRET_HEADER), deps.secret)) {
    return NextResponse.json(
      fail({ code: 'UNAUTHENTICATED', message: 'Invalid revalidation secret' }),
      { status: 401 },
    );
  }
  const body: unknown = await request.json().catch(() => null);
  const parsed = revalidateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail({ code: 'VALIDATION', message: 'Invalid revalidation request' }),
      { status: 400 },
    );
  }
  const tags = [...new Set(parsed.data.tags)];
  for (const tag of tags) deps.revalidateTag(tag);
  return NextResponse.json(ok({ revalidated: tags }));
};
