import { vi } from 'vitest';

export interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

export const okEnvelope = (data: unknown, meta?: unknown) =>
  new Response(
    JSON.stringify({ success: true, data, error: null, ...(meta === undefined ? {} : { meta }) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

export const errorEnvelope = (status: number, code: string, message: string, details?: unknown) =>
  new Response(
    JSON.stringify({
      success: false,
      data: null,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );

const inputUrl = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

/** Stubs `fetch`, records every call (with its parsed JSON body) and delegates to `handler`. */
export const stubFetch = (handler: (call: FetchCall, index: number) => Response): FetchCall[] => {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const raw = init?.body;
      const call: FetchCall = {
        url: inputUrl(input),
        method: init?.method ?? 'GET',
        body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
      };
      calls.push(call);
      return handler(call, calls.length);
    }),
  );
  return calls;
};

/** Shared `next/navigation` double; each test file still declares `vi.mock` itself (hoisting). */
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};
