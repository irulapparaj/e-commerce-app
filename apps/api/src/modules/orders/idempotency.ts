import { createHash } from 'crypto';

import type Redis from 'ioredis';

const IN_PROGRESS_TTL_SECONDS = 60;
const DONE_TTL_SECONDS = 86400; // 24 h

const buildKey = (userId: string, key: string): string => `idem:${userId}:${key}`;

interface InProgressState {
  readonly state: 'IN_PROGRESS';
  readonly bodyHash: string;
}

interface DoneState {
  readonly state: 'DONE';
  readonly status: number;
  readonly body: unknown;
  readonly bodyHash: string;
}

type StoredState = InProgressState | DoneState;

export type AcquireResult =
  | { readonly acquired: true }
  | { readonly acquired: false; readonly bodyMismatch: true }
  | { readonly acquired: false; readonly existing: unknown };

/** SHA-256 the request body (first 16 hex chars — enough to distinguish distinct carts). */
export const hashBody = (body: unknown): string =>
  createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);

/**
 * Attempts to acquire an idempotency lock bound to the request body hash.
 *
 * Returns `{ acquired: true }` on first call.
 * Returns `{ acquired: false, bodyMismatch: true }` when the key exists but was issued for a
 *   different request body — the client supplied the same Idempotency-Key with a different cart.
 * Returns `{ acquired: false, existing }` when the key is IN_PROGRESS or DONE for the same body.
 */
export const acquireIdempotencyKey = async (
  valkey: Redis,
  userId: string,
  key: string,
  bodyHash: string,
): Promise<AcquireResult> => {
  const redisKey = buildKey(userId, key);
  const result = await valkey.set(
    redisKey,
    JSON.stringify({ state: 'IN_PROGRESS', bodyHash } satisfies InProgressState),
    'EX',
    IN_PROGRESS_TTL_SECONDS,
    'NX',
  );

  if (result !== null) return { acquired: true };

  const raw = await valkey.get(redisKey);
  // Key expired between SET NX and GET — treat as fresh acquisition opportunity missed; let client retry
  if (raw === null) return { acquired: true };

  const stored = JSON.parse(raw) as StoredState;

  if (stored.bodyHash !== bodyHash) {
    return { acquired: false, bodyMismatch: true };
  }

  return { acquired: false, existing: stored };
};

/** Marks the idempotency key as done and stores the result for 24 h. */
export const completeIdempotencyKey = async (
  valkey: Redis,
  userId: string,
  key: string,
  result: { readonly status: number; readonly body: unknown },
  bodyHash: string,
): Promise<void> => {
  const redisKey = buildKey(userId, key);
  const value: DoneState = { state: 'DONE', bodyHash, ...result };
  await valkey.setex(redisKey, DONE_TTL_SECONDS, JSON.stringify(value));
};

/** Releases the lock so the client may retry. */
export const failIdempotencyKey = async (
  valkey: Redis,
  userId: string,
  key: string,
): Promise<void> => {
  await valkey.del(buildKey(userId, key));
};
