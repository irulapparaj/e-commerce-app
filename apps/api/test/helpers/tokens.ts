/**
 * Test token signing helper (P17).
 *
 * Signs a test JWT directly using the test key pairs from the env,
 * so security tests can generate tokens with specific claims without needing
 * a full OTP login flow.
 */
import type { ApiEnv } from '@pe/shared';
import type { Role } from '@prisma/client';

import type { Audience } from '../../src/modules/auth/token.service';
import { createTokenService } from '../../src/modules/auth/token.service';

export interface TestTokenClaims {
  readonly sub: string;
  readonly aud: Audience;
  readonly role: Role;
  readonly amr?: readonly string[];
  readonly stepUpExp?: number;
}

/**
 * Signs a test access token synchronously-ish using the test keys from env.
 * Returns a Promise<string> — call it with `await`.
 */
export const signTestToken = (env: ApiEnv, claims: TestTokenClaims): Promise<string> => {
  const svc = createTokenService({
    keys: env.JWT_KEYS_JSON,
    activeKid: env.JWT_ACTIVE_KID,
    issuer: env.JWT_ISSUER,
  });
  return svc.signAccess({
    sub: claims.sub,
    role: claims.role,
    aud: claims.aud,
    amr: claims.amr ?? [],
    ...(claims.stepUpExp !== undefined && { stepUpExp: claims.stepUpExp }),
  });
};
