import type { ErrorCode } from './errors';

export interface EnvelopeError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export interface EnvelopeMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly error: null;
  readonly meta?: EnvelopeMeta;
}

export interface ErrorEnvelope {
  readonly success: false;
  readonly data: null;
  readonly error: EnvelopeError;
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export const ok = <T>(data: T, meta?: EnvelopeMeta): SuccessEnvelope<T> =>
  meta === undefined
    ? { success: true, data, error: null }
    : { success: true, data, error: null, meta };

export const fail = (error: EnvelopeError): ErrorEnvelope => ({
  success: false,
  data: null,
  error,
});
