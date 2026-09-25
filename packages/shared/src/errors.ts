export const ERROR_CODES = [
  'INTERNAL',
  'VALIDATION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'CONFLICT',
  'SERVICE_UNAVAILABLE',
  'INSUFFICIENT_STOCK',
  'INVALID_OTP',
  'MFA_REQUIRED',
  'MFA_ENROLMENT_REQUIRED',
  'STEP_UP_REQUIRED',
  'IDEMPOTENCY_IN_PROGRESS',
  'INVALID_REDIRECT',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const DEFAULT_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  INTERNAL: 500,
  VALIDATION: 400,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  SERVICE_UNAVAILABLE: 503,
  INSUFFICIENT_STOCK: 409,
  INVALID_OTP: 401,
  MFA_REQUIRED: 401,
  MFA_ENROLMENT_REQUIRED: 403,
  STEP_UP_REQUIRED: 403,
  IDEMPOTENCY_IN_PROGRESS: 409,
  INVALID_REDIRECT: 400,
};

const DEFAULT_MESSAGE: Readonly<Record<ErrorCode, string>> = {
  INTERNAL: 'Something went wrong',
  VALIDATION: 'Request validation failed',
  NOT_FOUND: 'Resource not found',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Not allowed',
  RATE_LIMITED: 'Too many requests',
  CONFLICT: 'Conflict',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  INSUFFICIENT_STOCK: 'Insufficient stock',
  INVALID_OTP: 'Invalid or expired code',
  MFA_REQUIRED: 'Multi-factor authentication required',
  MFA_ENROLMENT_REQUIRED: 'Multi-factor authentication enrolment required',
  STEP_UP_REQUIRED: 'Recent re-authentication required',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this idempotency key is already in progress',
  INVALID_REDIRECT: 'Invalid redirect target',
};

export interface AppErrorOptions {
  readonly httpStatus?: number;
  readonly details?: unknown;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message?: string, options: AppErrorOptions = {}) {
    super(
      message ?? DEFAULT_MESSAGE[code],
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? DEFAULT_HTTP_STATUS[code];
    this.details = options.details;
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
