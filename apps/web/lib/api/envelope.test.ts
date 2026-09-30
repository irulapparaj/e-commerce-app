import { describe, expect, it } from 'vitest';

import { ApiError, isApiError, parseEnvelope, unwrapEnvelope } from './envelope';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('parseEnvelope', () => {
  it('returns a well-formed envelope as-is', async () => {
    const body = { success: true, data: [1], error: null, meta: { page: 1, limit: 20, total: 1 } };
    expect(await parseEnvelope(json(body))).toEqual(body);
  });

  it.each([
    ['html', new Response('<h1>502</h1>', { status: 502 })],
    ['empty', new Response(null, { status: 503 })],
    ['json without success', json({ hello: 'world' }, 500)],
    ['non-boolean success', json({ success: 'yes' }, 500)],
  ])('turns a %s body into an INTERNAL error envelope', async (_label, response) => {
    const status = response.status;
    expect(await parseEnvelope(response)).toEqual({
      success: false,
      data: null,
      error: { code: 'INTERNAL', message: `Unexpected response (${status})` },
    });
  });
});

describe('unwrapEnvelope', () => {
  it('returns data, and meta only when present', () => {
    expect(unwrapEnvelope({ success: true, data: 'x', error: null }, 200)).toEqual({ data: 'x' });
    expect(
      unwrapEnvelope(
        { success: true, data: 'x', error: null, meta: { page: 2, limit: 5, total: 9 } },
        200,
      ),
    ).toEqual({ data: 'x', meta: { page: 2, limit: 5, total: 9 } });
  });

  it('throws an ApiError carrying code, status, message and details', () => {
    const attempt = () =>
      unwrapEnvelope(
        {
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Product not found', details: { slug: 'x' } },
        },
        404,
      );
    expect(attempt).toThrow(ApiError);
    try {
      attempt();
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'ApiError',
        code: 'NOT_FOUND',
        status: 404,
        message: 'Product not found',
        details: { slug: 'x' },
      });
    }
    expect(isApiError(new Error('plain'))).toBe(false);
  });
});
