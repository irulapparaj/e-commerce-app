import 'server-only';

import { cookies } from 'next/headers';

import { callApi } from '@/lib/auth/api-client';
import { COOKIE_NAMES } from '@/lib/auth/cookies';

import type { AdminResult } from './api';

export type ServerResult<T> =
  | ({ readonly ok: true } & AdminResult<T>)
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

/** Server components: GET the private API with the `__Host-access` cookie as Bearer (R1). */
export const adminServerGet = async <T>(path: string): Promise<ServerResult<T>> => {
  const store = await cookies();
  const bearer = store.get(COOKIE_NAMES.access)?.value;
  const result = await callApi<T>(path, {
    method: 'GET',
    ...(bearer === undefined ? {} : { bearer }),
  });
  if (result.body.success)
    return result.body.meta === undefined
      ? { ok: true, data: result.body.data }
      : { ok: true, data: result.body.data, meta: result.body.meta };
  return {
    ok: false,
    status: result.status,
    code: result.body.error.code,
    message: result.body.error.message,
  };
};
