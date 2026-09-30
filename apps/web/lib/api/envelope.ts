import type { Envelope, EnvelopeMeta } from '@pe/shared';

export interface ApiResult<T> {
  readonly data: T;
  readonly meta?: EnvelopeMeta;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

const isEnvelopeShape = <T>(body: unknown): body is Envelope<T> =>
  typeof body === 'object' &&
  body !== null &&
  'success' in body &&
  typeof body.success === 'boolean';

/** A body that is not our envelope (HTML error page, empty 502) becomes an INTERNAL error envelope. */
export const parseEnvelope = async <T>(response: Response): Promise<Envelope<T>> => {
  const body: unknown = await response.json().catch(() => null);
  if (isEnvelopeShape<T>(body)) return body;
  return {
    success: false,
    data: null,
    error: { code: 'INTERNAL', message: `Unexpected response (${response.status})` },
  };
};

export const unwrapEnvelope = <T>(envelope: Envelope<T>, status: number): ApiResult<T> => {
  if (envelope.success) {
    return envelope.meta === undefined
      ? { data: envelope.data }
      : { data: envelope.data, meta: envelope.meta };
  }
  throw new ApiError(envelope.error.code, status, envelope.error.message, envelope.error.details);
};
