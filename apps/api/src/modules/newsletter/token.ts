/**
 * Unsubscribe token helpers for the newsletter module (H-33).
 *
 * Each subscriber gets a cryptographically-random 32-byte token that is
 * base64url-encoded to exactly 43 characters and stored in the unique
 * `unsubscribe_token` column.  Lookup is by the unique index, so forgery
 * is prevented by the randomness of the token itself.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32; // produces a 43-char base64url string

/** Generate a fresh unsubscribe token.  Call once per subscriber at creation time. */
export const generateUnsubscribeToken = (): string =>
  randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * Timing-safe comparison of two tokens.
 * Use after fetching the record to guard against timing attacks.
 */
export const verifyUnsubscribeToken = (candidate: string, stored: string): boolean => {
  try {
    const a = Buffer.from(candidate, 'base64url');
    const b = Buffer.from(stored, 'base64url');
    if (a.length !== TOKEN_BYTES || b.length !== TOKEN_BYTES) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};
