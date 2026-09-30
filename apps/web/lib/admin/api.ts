import type { Envelope, EnvelopeMeta } from '@pe/shared';

import { readCsrfCookie } from '@/lib/auth/client';
import { CSRF_HEADER } from '@/lib/auth/csrf-constants';

export interface AdminResult<T> {
  readonly data: T;
  readonly meta?: EnvelopeMeta;
}

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isAdminApiError = (value: unknown): value is AdminApiError =>
  value instanceof AdminApiError;

/** Resolves true once a fresh step-up token is in place, false when the user cancelled. */
export type StepUpHandler = () => Promise<boolean>;

const API_PREFIX = '/api/v1';
const STEP_UP_CODE = 'STEP_UP_REQUIRED';
const STEP_UP_STATUS = 403;

interface StepUpRegistry {
  handler: StepUpHandler | null;
  inflight: Promise<boolean> | null;
}

/** Installed by StepUpProvider; kept outside React so plain functions can trigger the dialog. */
const registry: StepUpRegistry = { handler: null, inflight: null };

export const setStepUpHandler = (handler: StepUpHandler): (() => void) => {
  registry.handler = handler;
  return () => {
    if (registry.handler === handler) registry.handler = null;
  };
};

/** Single flight: parallel 403s share one dialog instead of stacking prompts. */
const runStepUp = (): Promise<boolean> => {
  if (registry.handler === null) return Promise.resolve(false);
  if (registry.inflight !== null) return registry.inflight;
  const attempt = registry.handler().finally(() => {
    registry.inflight = null;
  });
  registry.inflight = attempt;
  return attempt;
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const csrfHeader = (): Record<string, string> => {
  const token = typeof document === 'undefined' ? undefined : readCsrfCookie(document.cookie);
  return token === undefined ? {} : { [CSRF_HEADER]: token };
};

const parseEnvelope = async <T>(response: Response): Promise<Envelope<T>> => {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return {
      success: false,
      data: null,
      error: { code: 'INTERNAL', message: `Unexpected response (${response.status})` },
    };
  }
};

export interface RequestOptions {
  /** Extra request headers, e.g. `X-Reveal-Token` for the P08 PII read. */
  readonly headers?: Readonly<Record<string, string>>;
}

const NO_OPTIONS: RequestOptions = {};

const send = async <T>(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<Envelope<T> & { readonly status: number }> => {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : csrfHeader()),
      ...(options.headers ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...(await parseEnvelope<T>(response)), status: response.status };
};

const isStepUpRequired = (result: { status: number; error: { code: string } | null }): boolean =>
  result.status === STEP_UP_STATUS && result.error?.code === STEP_UP_CODE;

const toResult = <T>(envelope: Envelope<T>): AdminResult<T> =>
  envelope.success && envelope.meta !== undefined
    ? { data: envelope.data, meta: envelope.meta }
    : { data: (envelope as { data: T }).data };

/** One request; on 403 STEP_UP_REQUIRED runs the dialog once and retries exactly once. */
const request = async <T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = NO_OPTIONS,
): Promise<AdminResult<T>> => {
  const first = await send<T>(method, path, body, options);
  if (first.success) return toResult(first);
  if (!isStepUpRequired(first)) throw fromEnvelope(first);
  const steppedUp = await runStepUp();
  if (!steppedUp) throw new AdminApiError(STEP_UP_CODE, STEP_UP_STATUS, 'Confirmation cancelled');
  const second = await send<T>(method, path, body, options);
  if (second.success) return toResult(second);
  throw fromEnvelope(second);
};

const fromEnvelope = (result: {
  status: number;
  error: { code: string; message: string; details?: unknown } | null;
}): AdminApiError =>
  new AdminApiError(
    result.error?.code ?? 'INTERNAL',
    result.status,
    result.error?.message ?? 'Request failed',
    result.error?.details,
  );

export const adminApi = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
} as const;
