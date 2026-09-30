import type Redis from 'ioredis';

export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: readonly string[]): Promise<void>;
}

interface CacheLogger {
  warn(obj: object, msg: string): void;
}

/**
 * Best-effort JSON cache on Valkey. Every operation swallows connection errors (logging them) so a
 * Valkey outage degrades to database reads instead of failing public catalogue requests.
 */
export const createJsonCache = (valkey: Redis, log: CacheLogger): JsonCache => {
  const guard = async <T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      log.warn({ err: error, op: label }, 'cache unavailable');
      return fallback;
    }
  };

  return {
    get: <T>(key: string) =>
      guard<T | null>(
        `get:${key}`,
        async () => {
          const raw = await valkey.get(key);
          return raw === null ? null : (JSON.parse(raw) as T);
        },
        null,
      ),
    set: (key, value, ttlSeconds) =>
      guard(
        `set:${key}`,
        async () => {
          await valkey.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        },
        undefined,
      ),
    del: (...keys) =>
      guard(
        `del:${keys.join(',')}`,
        async () => {
          if (keys.length > 0) await valkey.del(...keys);
        },
        undefined,
      ),
  };
};
