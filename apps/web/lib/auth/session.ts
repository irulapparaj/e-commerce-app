import 'server-only';

import { cookies } from 'next/headers';

import { getWebEnv } from '@/lib/env';

import { COOKIE_NAMES } from './cookies';
import { verifyAccessToken, type WebSession } from './jwt';

/** For server components and route handlers: verifies `__Host-access` locally and never calls the API. */
export const getSession = async (): Promise<WebSession | null> => {
  const store = await cookies();
  const env = getWebEnv();
  return verifyAccessToken(
    store.get(COOKIE_NAMES.access)?.value,
    env.JWT_PUBLIC_KEYS_JSON,
    env.JWT_ISSUER,
  );
};
