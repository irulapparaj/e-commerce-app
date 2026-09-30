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
  'PRODUCT_INCOMPLETE',
  'IMPORT_TOO_MANY_ROWS',
  'IMPORT_UNKNOWN_COLUMN',
  'ERASE_BLOCKED_ACTIVE_ORDERS',
  'REVEAL_EXPIRED',
  'SHIPPING_PROVIDER_ERROR',
  'REFUND_EXCEEDS_CAPTURED',
  'REAUTH_REQUIRED',
  'EXPORT_RATE_LIMITED',
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
  PRODUCT_INCOMPLETE: 422,
  IMPORT_TOO_MANY_ROWS: 400,
  IMPORT_UNKNOWN_COLUMN: 400,
  ERASE_BLOCKED_ACTIVE_ORDERS: 409,
  REVEAL_EXPIRED: 401,
  SHIPPING_PROVIDER_ERROR: 502,
  REFUND_EXCEEDS_CAPTURED: 409,
  REAUTH_REQUIRED: 403,
  EXPORT_RATE_LIMITED: 429,
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
  PRODUCT_INCOMPLETE:
    'Product needs at least one variant and one processed image before it can be published',
  IMPORT_TOO_MANY_ROWS: 'The import file has too many rows',
  IMPORT_UNKNOWN_COLUMN: 'The import file has a column that is not in the template',
  ERASE_BLOCKED_ACTIVE_ORDERS:
    'This customer has orders in progress; erasure must wait until they are delivered or cancelled',
  REVEAL_EXPIRED: 'The reveal window has expired; request a new reveal',
  SHIPPING_PROVIDER_ERROR: 'Shipping provider error',
  REFUND_EXCEEDS_CAPTURED: 'Refund amount exceeds the amount captured',
  REAUTH_REQUIRED: 'Re-authentication required for this action',
  EXPORT_RATE_LIMITED: 'Data export can only be requested once every 24 hours',
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
