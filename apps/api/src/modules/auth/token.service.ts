import { createPrivateKey, createPublicKey, type KeyObject, randomUUID } from 'node:crypto';

import { AppError, type JwtKeyPair, type JwtPublicKey } from '@pe/shared';
import type { Role } from '@prisma/client';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const AUDIENCES = ['storefront', 'admin', 'mfa'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const ACCESS_TTL_SECONDS: Readonly<Record<Audience, number>> = {
  storefront: 900,
  admin: 900,
  mfa: 300,
};
export const STEP_UP_TTL_SECONDS = 300;
/** Audience of the short-lived PII reveal token (P08 task 4); never accepted by `authenticate`. */
export const REVEAL_AUDIENCE = 'reveal';
const ALGORITHM = 'RS256';

export interface AccessClaims {
  readonly sub: string;
  readonly role: Role;
  readonly aud: Audience;
  readonly amr?: readonly string[];
  readonly stepUpExp?: number;
}

export interface VerifiedAccess extends AccessClaims {
  readonly jti: string;
  readonly exp: number;
  readonly iat: number;
}

const payloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(['CUSTOMER', 'ADMIN', 'STAFF']),
  aud: z.enum(AUDIENCES),
  amr: z.array(z.string()).optional(),
  stepUpExp: z.number().int().optional(),
  jti: z.string().min(1),
  exp: z.number().int(),
  iat: z.number().int(),
});

export interface RevealClaims {
  /** The staff member who justified the reveal; a token never works for anyone else. */
  readonly actorId: string;
  readonly customerId: string;
}

export interface VerifiedReveal extends RevealClaims {
  readonly exp: number;
  readonly jti: string;
}

const revealPayloadSchema = z.object({
  sub: z.uuid(),
  customerId: z.uuid(),
  jti: z.string().min(1),
  exp: z.number().int(),
});

export interface TokenServiceOptions {
  readonly keys: readonly JwtKeyPair[];
  readonly activeKid: string;
  readonly issuer: string;
  readonly now?: () => Date;
}

export interface TokenService {
  signAccess(claims: AccessClaims, ttlSeconds?: number): Promise<string>;
  verifyAccess(
    token: string,
    options: { readonly audience: Audience | readonly Audience[] },
  ): Promise<VerifiedAccess>;
  signReveal(claims: RevealClaims, ttlSeconds: number): Promise<string>;
  /** Throws REVEAL_EXPIRED for anything but a live, well-formed reveal token. */
  verifyReveal(token: string): Promise<VerifiedReveal>;
  readonly publicKeys: readonly JwtPublicKey[];
  readonly activeKid: string;
}

interface KeyMaterial {
  readonly activeKid: string;
  readonly privateKey: KeyObject;
  readonly publicKeys: ReadonlyMap<string, KeyObject>;
  readonly issuer: string;
  readonly now: () => Date;
}

const unauthenticated = (reason: string): AppError =>
  new AppError('UNAUTHENTICATED', 'Invalid or expired token', { cause: reason });

const loadKeys = ({
  keys,
  activeKid,
  issuer,
  now = () => new Date(),
}: TokenServiceOptions): KeyMaterial => {
  const active = keys.find((key) => key.kid === activeKid);
  if (active === undefined)
    throw new AppError('INTERNAL', `JWT_ACTIVE_KID ${activeKid} is not in JWT_KEYS_JSON`);
  return {
    activeKid,
    privateKey: createPrivateKey(active.privatePem),
    publicKeys: new Map(keys.map((key) => [key.kid, createPublicKey(key.publicPem)])),
    issuer,
    now,
  };
};

const signAccess = (
  material: KeyMaterial,
  claims: AccessClaims,
  ttlSeconds = ACCESS_TTL_SECONDS[claims.aud],
): Promise<string> => {
  const issuedAt = Math.floor(material.now().getTime() / 1000);
  const extra = {
    role: claims.role,
    ...(claims.amr === undefined ? {} : { amr: [...claims.amr] }),
    ...(claims.stepUpExp === undefined ? {} : { stepUpExp: claims.stepUpExp }),
  };
  return new SignJWT(extra)
    .setProtectedHeader({ alg: ALGORITHM, kid: material.activeKid })
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuer(material.issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .setJti(randomUUID())
    .sign(material.privateKey);
};

const toVerified = (payload: z.infer<typeof payloadSchema>): VerifiedAccess => {
  const { amr, stepUpExp, ...rest } = payload;
  return {
    ...rest,
    ...(amr === undefined ? {} : { amr }),
    ...(stepUpExp === undefined ? {} : { stepUpExp }),
  };
};

/** Pins RS256 (no alg confusion), resolves keys strictly by kid, and validates the claim shape. */
const verifyAccess = async (
  material: KeyMaterial,
  token: string,
  audience: Audience | readonly Audience[],
): Promise<VerifiedAccess> => {
  try {
    const { payload } = await jwtVerify(
      token,
      (header) => {
        const key = header.kid === undefined ? undefined : material.publicKeys.get(header.kid);
        if (key === undefined) throw new Error('unknown kid');
        return key;
      },
      {
        algorithms: [ALGORITHM],
        audience: [...(typeof audience === 'string' ? [audience] : audience)],
        issuer: material.issuer,
        currentDate: material.now(),
      },
    );
    const parsed = payloadSchema.safeParse({
      ...payload,
      aud: typeof payload.aud === 'string' ? payload.aud : payload.aud?.[0],
    });
    if (!parsed.success) throw new Error('malformed claims');
    return toVerified(parsed.data);
  } catch (error) {
    throw unauthenticated(error instanceof Error ? error.message : 'invalid token');
  }
};

const signReveal = (
  material: KeyMaterial,
  claims: RevealClaims,
  ttlSeconds: number,
): Promise<string> => {
  const issuedAt = Math.floor(material.now().getTime() / 1000);
  return new SignJWT({ customerId: claims.customerId })
    .setProtectedHeader({ alg: ALGORITHM, kid: material.activeKid })
    .setSubject(claims.actorId)
    .setAudience(REVEAL_AUDIENCE)
    .setIssuer(material.issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .setJti(randomUUID())
    .sign(material.privateKey);
};

const verifyReveal = async (material: KeyMaterial, token: string): Promise<VerifiedReveal> => {
  try {
    const { payload } = await jwtVerify(
      token,
      (header) => {
        const key = header.kid === undefined ? undefined : material.publicKeys.get(header.kid);
        if (key === undefined) throw new Error('unknown kid');
        return key;
      },
      {
        algorithms: [ALGORITHM],
        audience: REVEAL_AUDIENCE,
        issuer: material.issuer,
        currentDate: material.now(),
      },
    );
    const parsed = revealPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error('malformed claims');
    return {
      actorId: parsed.data.sub,
      customerId: parsed.data.customerId,
      exp: parsed.data.exp,
      jti: parsed.data.jti,
    };
  } catch (error) {
    throw new AppError('REVEAL_EXPIRED', undefined, { cause: error });
  }
};

export const createTokenService = (options: TokenServiceOptions): TokenService => {
  const material = loadKeys(options);
  return {
    signAccess: (claims, ttlSeconds) => signAccess(material, claims, ttlSeconds),
    verifyAccess: (token, { audience }) => verifyAccess(material, token, audience),
    signReveal: (claims, ttlSeconds) => signReveal(material, claims, ttlSeconds),
    verifyReveal: (token) => verifyReveal(material, token),
    publicKeys: options.keys.map((key) => ({ kid: key.kid, publicPem: key.publicPem })),
    activeKid: options.activeKid,
  };
};
