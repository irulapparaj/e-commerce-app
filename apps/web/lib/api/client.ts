import { readCsrfCookie } from '@/lib/auth/client';
import { CSRF_HEADER } from '@/lib/auth/csrf-constants';

import { type ApiResult, parseEnvelope, unwrapEnvelope } from './envelope';

/** Browser → BFF (`/api/v1/*` is proxied to the API by app/api/[...path]); cookies stay same-origin. */
const BFF_PREFIX = '/api/v1';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const csrfHeader = (): Readonly<Record<string, string>> => {
  const token = typeof document === 'undefined' ? undefined : readCsrfCookie(document.cookie);
  return token === undefined ? {} : { [CSRF_HEADER]: token };
};

const request = async <T>(method: Method, path: string, body?: unknown): Promise<ApiResult<T>> => {
  const response = await fetch(`${BFF_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : csrfHeader()),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return unwrapEnvelope(await parseEnvelope<T>(response), response.status);
};

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
} as const;
