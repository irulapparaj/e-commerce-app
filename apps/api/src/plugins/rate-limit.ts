import { type ApiEnv, AppError } from '@pe/shared';
import type Redis from 'ioredis';

import { sharedPlugin } from '../lib/plugin';

export interface RateLimitRule {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimiter {
  /** Consumes one hit on every rule or throws RATE_LIMITED (with Retry-After) when any rule is exhausted. */
  consume(rules: readonly RateLimitRule[]): Promise<void>;
  readonly multiplier: number;
}

const MS_PER_SECOND = 1000;

// Sliding window over a sorted set: prune, count, admit or report the wait until the oldest hit expires.
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, 0}
`;

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', undefined, { details: { retryAfterSeconds } });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** R15: the multiplier is honoured only under NODE_ENV=test; anything else is a boot error. */
export const resolveMultiplier = (
  env: Pick<ApiEnv, 'NODE_ENV' | 'RATE_LIMIT_MULTIPLIER'>,
): number => {
  if (env.RATE_LIMIT_MULTIPLIER === undefined) return 1;
  if (env.NODE_ENV !== 'test')
    throw new AppError('INTERNAL', 'RATE_LIMIT_MULTIPLIER is only allowed when NODE_ENV=test');
  return env.RATE_LIMIT_MULTIPLIER;
};

export const createRateLimiter = (
  valkey: Redis,
  multiplier: number,
  now: () => number = Date.now,
): RateLimiter => {
  const consumeOne = async (rule: RateLimitRule): Promise<number> => {
    const windowMs = rule.windowSeconds * MS_PER_SECOND;
    const member = `${now()}-${Math.random().toString(36).slice(2)}`;
    const result = (await valkey.eval(
      SLIDING_WINDOW_LUA,
      1,
      `rl:${rule.key}`,
      now(),
      windowMs,
      Math.ceil(rule.limit * multiplier),
      member,
    )) as [number, number];
    return result[0] === 1 ? 0 : Math.max(1, Math.ceil(result[1] / MS_PER_SECOND));
  };

  return {
    multiplier,
    consume: async (rules) => {
      for (const rule of rules) {
        const retryAfter = await consumeOne(rule);
        if (retryAfter > 0) throw new RateLimitedError(retryAfter);
      }
    },
  };
};

export const rateLimitPlugin = sharedPlugin(async (app) => {
  const multiplier = resolveMultiplier(app.env);
  app.decorate('rateLimiter', createRateLimiter(app.valkey, multiplier));
});
