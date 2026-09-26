import { AppError } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { RateLimitedError, resolveMultiplier } from './rate-limit';

describe('resolveMultiplier', () => {
  it('defaults to 1 and honours the env value only under NODE_ENV=test', () => {
    expect(resolveMultiplier({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveMultiplier({ NODE_ENV: 'test', RATE_LIMIT_MULTIPLIER: 100 })).toBe(100);
    expect(() => resolveMultiplier({ NODE_ENV: 'production', RATE_LIMIT_MULTIPLIER: 100 })).toThrow(
      AppError,
    );
    expect(() => resolveMultiplier({ NODE_ENV: 'development', RATE_LIMIT_MULTIPLIER: 2 })).toThrow(
      'NODE_ENV=test',
    );
  });
});

describe('RateLimitedError', () => {
  it('is a RATE_LIMITED AppError carrying retry-after seconds', () => {
    const error = new RateLimitedError(42);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.httpStatus).toBe(429);
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.details).toEqual({ retryAfterSeconds: 42 });
  });
});
