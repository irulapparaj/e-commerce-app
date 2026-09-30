/**
 * Review fix C-3: `trustProxy: true` let any client set `request.ip` via X-Forwarded-For,
 * defeating every per-IP control (rate limits, audit IPs, webhook allowlists).
 *
 * The Fastify `trustProxy` value is now derived from TRUSTED_PROXIES:
 * - unset/empty  → false (never trust forwarded headers; request.ip = socket peer)
 * - integer N    → trust the first N hops behind the socket peer
 * - anything else → comma-separated allowlist of proxy IPs / CIDR ranges
 */
export type TrustProxyFn = (address: string, hop: number) => boolean;
export type TrustProxySetting = boolean | readonly string[] | TrustProxyFn;

const HOP_COUNT_PATTERN = /^\d+$/;

export const parseTrustProxy = (raw: string | undefined): TrustProxySetting => {
  const value = raw?.trim();
  if (value === undefined || value === '') return false;
  if (HOP_COUNT_PATTERN.test(value)) {
    const hops = Number.parseInt(value, 10);
    // Same semantics as Express's numeric `trust proxy`: hop 0 is the socket peer.
    return (_address: string, hop: number) => hop < hops;
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
};
