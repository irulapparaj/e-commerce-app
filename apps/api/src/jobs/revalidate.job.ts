import { AppError } from '@pe/shared';

import type { RevalidatePayload } from './queue';

export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret';
export const REVALIDATE_PATH = '/api/internal/revalidate';
/** R8: three retries at 1 s, 5 s and 30 s before the job is reported failed. */
export const REVALIDATE_RETRY_DELAYS_MS: readonly number[] = [1_000, 5_000, 30_000];
const REQUEST_TIMEOUT_MS = 5_000;

export interface RevalidateHandlerOptions {
  readonly webOrigin: string;
  readonly secret: string;
  readonly fetchImpl?: typeof fetch;
  readonly delaysMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: { warn(obj: object, msg: string): void };
}

export interface RevalidateResult {
  readonly revalidated: readonly string[];
  readonly attempts: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const attemptOnce = async (
  fetchImpl: typeof fetch,
  url: string,
  secret: string,
  tags: readonly string[],
): Promise<string | null> => {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [REVALIDATE_SECRET_HEADER]: secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? null : `web responded ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : 'request failed';
  }
};

/** Job handler: POSTs `{ tags }` to the web app's revalidation route with the shared secret. */
export const createRevalidateHandler = (options: RevalidateHandlerOptions) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delays = options.delaysMs ?? REVALIDATE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;
  const url = `${options.webOrigin.replace(/\/+$/, '')}${REVALIDATE_PATH}`;

  return async (payload: RevalidatePayload): Promise<RevalidateResult> => {
    const tags = [...payload.tags];
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      lastError = await attemptOnce(fetchImpl, url, options.secret, tags);
      if (lastError === null) return { revalidated: tags, attempts: attempt + 1 };
      options.log?.warn(
        { attempt: attempt + 1, error: lastError, tags },
        'revalidate attempt failed',
      );
      const delay = delays[attempt];
      if (delay !== undefined) await sleep(delay);
    }
    throw new AppError('SERVICE_UNAVAILABLE', `Revalidation failed: ${lastError ?? 'unknown'}`, {
      details: { tags },
    });
  };
};
