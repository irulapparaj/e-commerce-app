import { AppError } from '@pe/shared';
import type { User } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

import type { MfaService } from './mfa.service';
import type { OtpService } from './otp.service';
import type { RefreshService, Session, SessionMeta } from './refresh.service';
import type { SecurityEvents } from './security-events';
import { STEP_UP_TTL_SECONDS, type TokenService } from './token.service';

export type LoginResult =
  | { readonly kind: 'session'; readonly session: Session }
  | { readonly kind: 'mfa-required'; readonly mfaToken: string }
  | { readonly kind: 'mfa-enrolment-required'; readonly mfaToken: string };

export interface StepUpResult {
  readonly accessToken: string;
  readonly stepUpExp: number;
}

export interface LoginService {
  verifyOtpLogin(
    input: { email: string; nonce: string; otp: string },
    meta: SessionMeta,
  ): Promise<LoginResult>;
  completeMfa(userId: string, code: string, meta: SessionMeta): Promise<Session>;
  stepUp(userId: string, code: string): Promise<StepUpResult>;
}

export interface LoginServiceDeps {
  readonly prisma: PrismaDb;
  readonly otp: OtpService;
  readonly refresh: RefreshService;
  readonly mfa: MfaService;
  readonly tokens: TokenService;
  readonly events: SecurityEvents;
  readonly now?: () => Date;
}

const ADMIN_ROLES = new Set<User['role']>(['ADMIN', 'STAFF']);

const isSignInAllowed = (user: User): boolean => !user.isDisabled && user.deletedAt === null;

const findOrCreateCustomer = async (prisma: PrismaDb, email: string): Promise<User> =>
  (await prisma.user.findUnique({ where: { email } })) ??
  prisma.user.create({ data: { email, role: 'CUSTOMER' } });

export const createLoginService = ({
  prisma,
  otp,
  refresh,
  mfa,
  tokens,
  events,
  now = () => new Date(),
}: LoginServiceDeps): LoginService => {
  /** Never branches on account existence before the code is verified (P03 review note). */
  const verifyOtpLogin: LoginService['verifyOtpLogin'] = async (input, meta) => {
    const ok = await otp.verify(input.email, input.nonce, input.otp);
    if (!ok) {
      events.record('auth.otp.failed', { email: input.email, ip: meta.ip });
      throw new AppError('INVALID_OTP');
    }
    const user = await findOrCreateCustomer(prisma, input.email);
    if (!isSignInAllowed(user)) {
      events.record('auth.login.rejected', { userId: user.id, reason: 'disabled' });
      throw new AppError('INVALID_OTP');
    }
    if (ADMIN_ROLES.has(user.role)) {
      const mfaToken = await tokens.signAccess({ sub: user.id, role: user.role, aud: 'mfa' });
      return user.mfaEnabled
        ? { kind: 'mfa-required', mfaToken }
        : { kind: 'mfa-enrolment-required', mfaToken };
    }
    return { kind: 'session', session: await refresh.issueSession(user, 'storefront', meta) };
  };

  const completeMfa: LoginService['completeMfa'] = async (userId, code, meta) => {
    const user = await mfa.verify(userId, code);
    if (!isSignInAllowed(user) || !ADMIN_ROLES.has(user.role)) throw new AppError('INVALID_OTP');
    return refresh.issueSession(user, 'admin', meta);
  };

  const stepUp: LoginService['stepUp'] = async (userId, code) => {
    const user = await mfa.verifyTotp(userId, code);
    const stepUpExp = Math.floor(now().getTime() / 1000) + STEP_UP_TTL_SECONDS;
    const accessToken = await tokens.signAccess({
      sub: user.id,
      role: user.role,
      aud: 'admin',
      amr: ['step-up'],
      stepUpExp,
    });
    events.record('auth.step_up', { userId });
    return { accessToken, stepUpExp };
  };

  return { verifyOtpLogin, completeMfa, stepUp };
};
