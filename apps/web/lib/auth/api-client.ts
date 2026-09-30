import { fail, type Envelope } from '@pe/shared';

import { getWebEnv } from '@/lib/env';

export interface ApiCallOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
  readonly bearer?: string;
  readonly forwardFrom?: Request;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export interface ApiCallResult<T> {
  readonly status: number;
  readonly body: Envelope<T>;
}

const FORWARDED_HEADERS = ['user-agent', 'x-forwarded-for', 'x-previous-session'] as const;

const forwardedHeaders = (request: Request | undefined): Record<string, string> =>
  FORWARDED_HEADERS.reduce<Record<string, string>>((acc, name) => {
    const value = request?.headers.get(name);
    return value === null || value === undefined ? acc : { ...acc, [name]: value };
  }, {});

/** Server-to-server call to the private API (R1). Tokens travel as Bearer, never as cookies. */
export const callApi = async <T>(
  path: string,
  options: ApiCallOptions = {},
): Promise<ApiCallResult<T>> => {
  const env = getWebEnv();
  let response: Response;
  try {
    response = await fetch(`${env.API_INTERNAL_URL}/api/v1${path}`, {
      method: options.method ?? 'POST',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...forwardedHeaders(options.forwardFrom),
        ...(options.extraHeaders ?? {}),
        ...(options.bearer === undefined ? {} : { authorization: `Bearer ${options.bearer}` }),
      },
      body: options.body === undefined ? null : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch {
    return {
      status: 503,
      body: fail({ code: 'SERVICE_UNAVAILABLE', message: 'API is unreachable' }) as Envelope<T>,
    };
  }
  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    body = fail({ code: 'SERVICE_UNAVAILABLE', message: 'Empty response from API' });
  }
  return { status: response.status, body };
};
