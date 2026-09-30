import type Redis from 'ioredis';

/** Events counted in 24 h windows for `GET /admin/security` (P05 task 5, P06 task 6). */
export const COUNTER_EVENTS = [
  'auth.otp.failed',
  'auth.mfa.failed',
  'webhook.signature.invalid.RAZORPAY',
  'webhook.signature.invalid.SHIPROCKET',
  'webhook.signature.invalid.EMAIL',
  'inventory.ledger.drift',
  'customer.pii.reveal.limited',
] as const;

export type CounterEvent = (typeof COUNTER_EVENTS)[number];

export const WINDOW_HOURS = 24;
const HOUR_MS = 3_600_000;
/** Buckets outlive the window by one hour so a bucket that is still inside it never expires early. */
const BUCKET_TTL_SECONDS = (WINDOW_HOURS + 1) * 3600;
const KEY_PREFIX = 'sec';

export const bucketKey = (event: CounterEvent, atMs: number): string =>
  `${KEY_PREFIX}:${event}:${Math.floor(atMs / HOUR_MS)}`;

/** The 24 hourly buckets ending in the bucket that contains `atMs` (inclusive). */
export const windowKeys = (event: CounterEvent, atMs: number): readonly string[] =>
  Array.from({ length: WINDOW_HOURS }, (_, index) => bucketKey(event, atMs - index * HOUR_MS));

export interface SecurityCounters {
  increment(event: CounterEvent): Promise<void>;
  count24h(event: CounterEvent): Promise<number>;
}

interface CounterLogger {
  warn(obj: object, msg: string): void;
}

export const createSecurityCounters = (
  valkey: Redis,
  log: CounterLogger,
  now: () => number = Date.now,
): SecurityCounters => ({
  increment: async (event) => {
    try {
      const key = bucketKey(event, now());
      await valkey.multi().incr(key).expire(key, BUCKET_TTL_SECONDS).exec();
    } catch (error) {
      log.warn({ err: error, event }, 'security counter unavailable');
    }
  },
  count24h: async (event) => {
    try {
      const values = await valkey.mget(...windowKeys(event, now()));
      return values.reduce<number>((sum, value) => sum + (value === null ? 0 : Number(value)), 0);
    } catch (error) {
      log.warn({ err: error, event }, 'security counter unavailable');
      return 0;
    }
  },
});
