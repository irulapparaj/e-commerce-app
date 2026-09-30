import 'server-only';

import { cookies } from 'next/headers';

import { COOKIE_NAMES } from '@/lib/auth/cookies';
import { getWebEnv } from '@/lib/env';

import { type ApiResult, parseEnvelope, unwrapEnvelope } from './envelope';

const API_PREFIX = '/api/v1';

export interface ApiGetOptions {
  /** Data-cache tags matching the API's revalidation scheme: `home`, `categories`, `search`, `settings`, `product:{slug}`, `category:{slug}`. */
  readonly tags?: readonly string[];
  /** Seconds, or `false` to cache indefinitely until a tag is revalidated. */
  readonly revalidate?: number | false;
  /**
   * Forward the visitor's `__Host-access` cookie as a Bearer token. Authenticated responses are
   * never stored in the shared data cache, so `tags`/`revalidate` are ignored when this is set.
   */
  readonly auth?: boolean;
}

/** `cookies()` throws outside a request scope (build-time prerender); there is no visitor to forward then. */
const readBearer = async (): Promise<string | undefined> => {
  try {
    return (await cookies()).get(COOKIE_NAMES.access)?.value;
  } catch {
    return undefined;
  }
};

const cacheInit = (options: ApiGetOptions): RequestInit =>
  options.auth === true
    ? { cache: 'no-store' }
    : {
        next: {
          ...(options.tags === undefined ? {} : { tags: [...options.tags] }),
          ...(options.revalidate === undefined ? {} : { revalidate: options.revalidate }),
        },
      };

/**
 * Server components → private API (R1). The visitor's cookies never travel; at most the access
 * token goes as a Bearer header. Unwraps the envelope and throws `ApiError { code, status }`.
 */
export const apiGet = async <T>(
  path: string,
  options: ApiGetOptions = {},
): Promise<ApiResult<T>> => {
  const env = getWebEnv();
  const bearer = options.auth === true ? await readBearer() : undefined;
  const response = await fetch(`${env.API_INTERNAL_URL}${API_PREFIX}${path}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...cacheInit(options),
  });
  return unwrapEnvelope(await parseEnvelope<T>(response), response.status);
};
