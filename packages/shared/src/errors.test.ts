import { describe, expect, it } from 'vitest';

import { brand } from './brand';
import { fail, ok } from './envelope';
import { AppError, DEFAULT_HTTP_STATUS, ERROR_CODES, isAppError } from './errors';

describe('AppError', () => {
  it('uses the default status and message for a code', () => {
    const error = new AppError('NOT_FOUND');

    expect(error.httpStatus).toBe(404);
    expect(error.message).toBe('Resource not found');
    expect(error.name).toBe('AppError');
    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });

  it('accepts overrides for status, details and cause', () => {
    const cause = new Error('db down');
    const error = new AppError('INTERNAL', 'custom', { httpStatus: 502, details: { a: 1 }, cause });

    expect(error.httpStatus).toBe(502);
    expect(error.message).toBe('custom');
    expect(error.details).toEqual({ a: 1 });
    expect(error.cause).toBe(cause);
  });

  it('has a default status for every code', () => {
    for (const code of ERROR_CODES) expect(DEFAULT_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
  });
});

describe('envelope', () => {
  it('builds success envelopes with optional meta', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null });
    expect(ok([], { page: 1, limit: 20, total: 0 })).toEqual({
      success: true,
      data: [],
      error: null,
      meta: { page: 1, limit: 20, total: 0 },
    });
  });

  it('builds error envelopes', () => {
    expect(fail({ code: 'FORBIDDEN', message: 'no' })).toEqual({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'no' },
    });
  });
});

describe('brand', () => {
  it('exposes the placeholder brand without a logo', () => {
    expect(brand.name).toBe('Invita Company');
    expect(brand.logoKey).toBeNull();
  });
});
