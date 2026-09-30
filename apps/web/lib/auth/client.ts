import { COOKIE_NAMES } from './cookies';
import { CSRF_HEADER } from './csrf-constants';

export interface ClientEnvelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

/** Reads the non-httpOnly csrf cookie in the browser for double-submit requests. */
export const readCsrfCookie = (cookieString: string): string | undefined =>
  cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAMES.csrf}=`))
    ?.slice(COOKIE_NAMES.csrf.length + 1);

export const postJson = async <T>(
  path: string,
  body: unknown,
): Promise<{ status: number; envelope: ClientEnvelope<T> }> => {
  const csrf = typeof document === 'undefined' ? undefined : readCsrfCookie(document.cookie);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(csrf === undefined ? {} : { [CSRF_HEADER]: csrf }),
    },
    body: JSON.stringify(body),
  });
  let envelope: ClientEnvelope<T>;
  try {
    envelope = (await response.json()) as ClientEnvelope<T>;
  } catch {
    envelope = { success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'Unexpected server response' } };
  }
  return { status: response.status, envelope };
};
