import type { ErrorCode } from './errors';

export interface EnvelopeError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

/** Paise. The unfiltered price spread of the listing's scope; null when the scope has no products. */
export interface PriceRange {
  readonly min: number;
  readonly max: number;
  /** Product counts over equal-width price buckets between min and max (the filter histogram). */
  readonly buckets?: readonly number[];
}

export interface EnvelopeMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly priceRange?: PriceRange | null;
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
