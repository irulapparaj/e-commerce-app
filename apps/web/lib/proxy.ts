const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Never forwarded to the API: it is Bearer-only and must not see browser cookies (R1). */
const STRIPPED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  ...HOP_BY_HOP_HEADERS,
  'cookie',
  'authorization',
  'host',
  'content-length',
]);

/** Never returned to the browser: the API sets no cookies and hop-by-hop headers are per-connection. */
const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  ...HOP_BY_HOP_HEADERS,
  'set-cookie',
  'content-encoding',
  'content-length',
]);

const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export const buildUpstreamUrl = (
  apiBase: string,
  path: readonly string[],
  search: string,
): string => {
  const base = apiBase.replace(/\/+$/, '');
  const segments = path.map((segment) => encodeURIComponent(decodeURIComponent(segment))).join('/');
  return `${base}/api/${segments}${search}`;
};

export const buildUpstreamHeaders = (
  incoming: Headers,
  extra: Readonly<Record<string, string>> = {},
): Headers => {
  const headers = new Headers();
  incoming.forEach((value, name) => {
    if (!STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
};

export const filterResponseHeaders = (upstream: Headers): Headers => {
  const headers = new Headers();
  upstream.forEach((value, name) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  return headers;
};

export const methodHasBody = (method: string): boolean =>
  !METHODS_WITHOUT_BODY.has(method.toUpperCase());
