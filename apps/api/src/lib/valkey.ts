import Redis from 'ioredis';

const CONNECT_TIMEOUT_MS = 2_000;
const MAX_RETRY_DELAY_MS = 2_000;
const RETRY_STEP_MS = 200;

export type ValkeyErrorHandler = (error: Error) => void;

const IGNORE: ValkeyErrorHandler = () => undefined;

/** Connection errors are reported through `onError` (and readiness), never as unhandled events. */
export const createValkeyClient = (url: string, onError: ValkeyErrorHandler = IGNORE): Redis => {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => Math.min(attempt * RETRY_STEP_MS, MAX_RETRY_DELAY_MS),
  });
  client.on('error', onError);
  return client;
};

export const connectValkey = async (client: Redis): Promise<boolean> => {
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  }
};
