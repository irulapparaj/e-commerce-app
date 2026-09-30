import { describe, expect, it, vi } from 'vitest';

import { handleRevalidate, isValidRevalidateSecret, REVALIDATE_SECRET_HEADER } from './revalidate';

const SECRET = 'web-test-revalidate-secret-0123';

const post = (body: unknown, secret?: string) =>
  new Request('http://localhost:3000/api/internal/revalidate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret === undefined ? {} : { [REVALIDATE_SECRET_HEADER]: secret }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('isValidRevalidateSecret', () => {
  it('accepts only an exact match and rejects empty, shorter, longer and near misses', () => {
    expect(isValidRevalidateSecret(SECRET, SECRET)).toBe(true);
    expect(isValidRevalidateSecret(null, SECRET)).toBe(false);
    expect(isValidRevalidateSecret('', SECRET)).toBe(false);
    expect(isValidRevalidateSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(isValidRevalidateSecret(`${SECRET}x`, SECRET)).toBe(false);
    expect(isValidRevalidateSecret(SECRET.replace('0', '1'), SECRET)).toBe(false);
    expect(isValidRevalidateSecret(SECRET, '')).toBe(false);
  });
});

describe('handleRevalidate', () => {
  it('rejects a wrong or missing secret with 401 before reading the body', async () => {
    const revalidateTag = vi.fn<(tag: string) => void>();

    const wrong = await handleRevalidate(post({ tags: ['home'] }, 'nope'), {
      secret: SECRET,
      revalidateTag,
    });
    const missing = await handleRevalidate(post({ tags: ['home'] }), {
      secret: SECRET,
      revalidateTag,
    });

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('validates the body and calls revalidateTag once per distinct tag', async () => {
    const revalidateTag = vi.fn<(tag: string) => void>();

    const res = await handleRevalidate(
      post({ tags: ['product:pure-camphor', 'home', 'home'] }, SECRET),
      { secret: SECRET, revalidateTag },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { revalidated: ['product:pure-camphor', 'home'] },
      error: null,
    });
    expect(revalidateTag.mock.calls.map((call) => call[0])).toEqual([
      'product:pure-camphor',
      'home',
    ]);
  });

  it('returns 400 for malformed bodies and unsafe tags', async () => {
    const revalidateTag = vi.fn<(tag: string) => void>();

    for (const body of [
      { tags: [] },
      { tags: ['Bad Tag'] },
      { tags: ['home'], extra: 1 },
      'not json',
      { tags: ['../x'] },
    ]) {
      const res = await handleRevalidate(post(body, SECRET), { secret: SECRET, revalidateTag });
      expect(res.status).toBe(400);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
