import { createHmac, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'sha256';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const PURPOSE = 'newsletter' as const;

export type UnsubscribePurpose = typeof PURPOSE;

export interface UnsubscribePayload {
  readonly emailHash: string;
  readonly purpose: UnsubscribePurpose;
  readonly exp: number;
}

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, 'utf8').toString('base64url');

const base64UrlDecode = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8');

const sign = (payload: string, secret: string): string =>
  createHmac(ALGORITHM, secret).update(payload).digest('base64url');

/**
 * Signs an unsubscribe token bound to an emailHash and purpose.
 * Token format: base64url(payload).signature
 */
export const signUnsubscribeToken = (
  emailHash: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string => {
  const payload: UnsubscribePayload = {
    emailHash,
    purpose: PURPOSE,
    exp: nowSeconds + THIRTY_DAYS_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
};

export type VerifyResult =
  | { readonly ok: true; readonly payload: UnsubscribePayload }
  | { readonly ok: false; readonly reason: string };

/**
 * Verifies an unsubscribe token in a timing-safe way.
 * Returns the payload on success; returns an error reason on failure.
 */
export const verifyUnsubscribeToken = (
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifyResult => {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return { ok: false, reason: 'malformed token' };

  const encoded = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expectedSig = sign(encoded, secret);

  const providedBuf = Buffer.from(providedSig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');

  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { ok: false, reason: 'invalid signature' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as unknown;
  } catch {
    return { ok: false, reason: 'malformed payload' };
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).emailHash !== 'string' ||
    typeof (payload as Record<string, unknown>).purpose !== 'string' ||
    typeof (payload as Record<string, unknown>).exp !== 'number'
  ) {
    return { ok: false, reason: 'invalid payload structure' };
  }

  const typed = payload as UnsubscribePayload;

  if (typed.purpose !== PURPOSE) {
    return { ok: false, reason: 'purpose mismatch' };
  }

  if (typed.exp < nowSeconds) {
    return { ok: false, reason: 'token expired' };
  }

  return { ok: true, payload: typed };
};
