import { createHash, randomBytes } from 'node:crypto';

import type { RefreshAudience } from '@prisma/client';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60_000;
const TOKEN_BYTES = 32;

export interface RefreshTtl {
  readonly absoluteMs: number;
  readonly idleMs: number;
}

/** DESIGN §7: storefront 30 d absolute / 7 d idle; admin 8 h absolute / 30 min idle. */
export const REFRESH_TTL: Readonly<Record<RefreshAudience, RefreshTtl>> = {
  STOREFRONT: { absoluteMs: 30 * DAY_MS, idleMs: 7 * DAY_MS },
  ADMIN: { absoluteMs: 8 * HOUR_MS, idleMs: 30 * MINUTE_MS },
};

export interface RefreshRecord {
  readonly audience: RefreshAudience;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date;
  readonly revokedAt: Date | null;
}

export type RotationDecision =
  | { readonly action: 'rotate' }
  | { readonly action: 'revoke-family'; readonly reason: 'reuse' }
  | { readonly action: 'revoke'; readonly reason: 'expired' | 'idle' };

/** Pure state machine over a stored refresh token; the service applies the side effects. */
export const decideRotation = (record: RefreshRecord, now: Date): RotationDecision => {
  if (record.revokedAt !== null) return { action: 'revoke-family', reason: 'reuse' };
  if (now.getTime() >= record.expiresAt.getTime()) return { action: 'revoke', reason: 'expired' };
  if (now.getTime() - record.lastUsedAt.getTime() > REFRESH_TTL[record.audience].idleMs)
    return { action: 'revoke', reason: 'idle' };
  return { action: 'rotate' };
};

export const generateRawToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

export const absoluteExpiry = (audience: RefreshAudience, now: Date): Date =>
  new Date(now.getTime() + REFRESH_TTL[audience].absoluteMs);
