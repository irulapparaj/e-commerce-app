import type { JwtPublicKey } from '@pe/shared';
import { importSPKI, jwtVerify } from 'jose';

export type Audience = 'storefront' | 'admin' | 'mfa';

export interface WebSession {
  readonly userId: string;
  readonly role: 'CUSTOMER' | 'ADMIN' | 'STAFF';
  readonly aud: Audience;
  readonly amr: readonly string[];
  readonly stepUpExp: number | null;
  readonly exp: number;
}

const ALGORITHM = 'RS256';
const keyCache = new Map<string, Promise<CryptoKey>>();

const publicKey = (kid: string, keys: readonly JwtPublicKey[]): Promise<CryptoKey> | undefined => {
  const cached = keyCache.get(kid);
  if (cached !== undefined) return cached;
  const pem = keys.find((key) => key.kid === kid)?.publicPem;
  if (pem === undefined) return undefined;
  const imported = importSPKI(pem, ALGORITHM);
  keyCache.set(kid, imported);
  return imported;
};

const ROLES: ReadonlySet<string> = new Set(['CUSTOMER', 'ADMIN', 'STAFF']);
const AUDIENCES: ReadonlySet<string> = new Set(['storefront', 'admin', 'mfa']);

/** Local verification with the API's public keys (R1): no network round-trip per request. */
export const verifyAccessToken = async (
  token: string | undefined,
  keys: readonly JwtPublicKey[],
  issuer: string,
): Promise<WebSession | null> => {
  if (token === undefined || token === '') return null;
  try {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        const key = header.kid === undefined ? undefined : await publicKey(header.kid, keys);
        if (key === undefined) throw new Error('unknown kid');
        return key;
      },
      { algorithms: [ALGORITHM], issuer },
    );
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const role = payload.role;
    if (typeof payload.sub !== 'string' || typeof aud !== 'string' || !AUDIENCES.has(aud))
      return null;
    if (typeof role !== 'string' || !ROLES.has(role) || typeof payload.exp !== 'number')
      return null;
    return {
      userId: payload.sub,
      role: role as WebSession['role'],
      aud: aud as Audience,
      amr: Array.isArray(payload.amr)
        ? payload.amr.filter((v): v is string => typeof v === 'string')
        : [],
      stepUpExp: typeof payload.stepUpExp === 'number' ? payload.stepUpExp : null,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
};
