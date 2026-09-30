import { AppError } from '@pe/shared';
import type { Role } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { type Audience, STEP_UP_TTL_SECONDS } from './token.service';

export const REAUTH_TTL_SECONDS = 300;
export const REAUTH_AMR = 'reauth' as const;

export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
  readonly aud: Audience;
  readonly amr: readonly string[];
  readonly stepUpExp: number | null;
  readonly jti: string;
  readonly mfaEnabled: boolean;
}

export type Guard = (request: FastifyRequest) => Promise<void>;

export interface Guards {
  authenticate(audience: Audience | readonly Audience[]): Guard;
  requireRole(...roles: readonly Role[]): Guard;
  requireAudience(audience: Audience): Guard;
  requireMfaEnrolled(): Guard;
  requireStepUp(): Guard;
  /** Accepts either `step-up` (admin TOTP) or `reauth` (customer OTP) depending on allowed set. */
  requireAmr(allowed: readonly string[]): Guard;
}

const BEARER_PREFIX = 'Bearer ';
const MFA_ROLES: readonly Role[] = ['ADMIN', 'STAFF'];

export const currentUser = (request: FastifyRequest): AuthenticatedUser => {
  if (request.user === undefined) throw new AppError('UNAUTHENTICATED');
  return request.user;
};

export const createGuards = (app: FastifyInstance, now: () => Date = () => new Date()): Guards => {
  const authenticate: Guards['authenticate'] = (audience) => async (request) => {
    const header = request.headers.authorization ?? '';
    if (!header.startsWith(BEARER_PREFIX)) throw new AppError('UNAUTHENTICATED');
    const claims = await app.auth.tokens.verifyAccess(header.slice(BEARER_PREFIX.length), {
      audience,
    });
    const state = await app.auth.userState.get(claims.sub);
    if (state === null || state.isDisabled || state.isDeleted)
      throw new AppError('UNAUTHENTICATED');
    request.user = {
      id: claims.sub,
      role: state.role,
      aud: claims.aud,
      amr: claims.amr ?? [],
      stepUpExp: claims.stepUpExp ?? null,
      jti: claims.jti,
      mfaEnabled: state.mfaEnabled,
    };
  };

  const requireRole: Guards['requireRole'] =
    (...roles) =>
    async (request) => {
      if (!roles.includes(currentUser(request).role)) throw new AppError('FORBIDDEN');
    };

  const requireAudience: Guards['requireAudience'] = (audience) => async (request) => {
    if (currentUser(request).aud !== audience) throw new AppError('FORBIDDEN');
  };

  const requireMfaEnrolled: Guards['requireMfaEnrolled'] = () => async (request) => {
    const user = currentUser(request);
    if (MFA_ROLES.includes(user.role) && !user.mfaEnabled)
      throw new AppError('MFA_ENROLMENT_REQUIRED');
  };

  const requireStepUp: Guards['requireStepUp'] = () => async (request) => {
    const user = currentUser(request);
    const nowSeconds = Math.floor(now().getTime() / 1000);
    if (!user.amr.includes('step-up') || user.stepUpExp === null || user.stepUpExp <= nowSeconds) {
      throw new AppError('STEP_UP_REQUIRED', undefined, {
        details: { windowSeconds: STEP_UP_TTL_SECONDS },
      });
    }
  };

  const requireAmr: Guards['requireAmr'] = (allowed) => async (request) => {
    const user = currentUser(request);
    const nowSeconds = Math.floor(now().getTime() / 1000);
    const hasAmr = allowed.some((amr) => user.amr.includes(amr));
    if (!hasAmr || user.stepUpExp === null || user.stepUpExp <= nowSeconds) {
      throw new AppError('REAUTH_REQUIRED', undefined, {
        details: { windowSeconds: REAUTH_TTL_SECONDS },
      });
    }
  };

  return {
    authenticate,
    requireRole,
    requireAudience,
    requireMfaEnrolled,
    requireStepUp,
    requireAmr,
  };
};
