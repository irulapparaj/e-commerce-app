import { createHash, randomBytes } from 'node:crypto';

import { AppError, brand } from '@pe/shared';
import type { User } from '@prisma/client';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';

import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';

import { RECOVERY_CODE_PATTERN, TOTP_PATTERN } from './schemas';
import type { SecurityEvents } from './security-events';

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const RECOVERY_SEGMENT = 4;
const TOTP_WINDOW = 1;

export interface Enrolment {
  readonly secret: string;
  readonly otpauthUrl: string;
  readonly qrDataUrl: string;
  readonly recoveryCodes: readonly string[];
}

export interface MfaService {
  enrol(userId: string): Promise<Enrolment>;
  /** Accepts a TOTP code or an unused recovery code; enables MFA on the first success. */
  verify(userId: string, code: string): Promise<User>;
  /** TOTP only; used for step-up re-authentication. */
  verifyTotp(userId: string, code: string): Promise<User>;
}

export interface MfaServiceDeps {
  readonly prisma: PrismaDb;
  readonly keys: KeyProvider;
  readonly events: SecurityEvents;
  readonly now?: () => Date;
}

type Deps = Required<MfaServiceDeps>;

const totp = authenticator.clone({ window: TOTP_WINDOW });

export const hashRecoveryCode = (code: string): string =>
  createHash('sha256').update(code.trim().toLowerCase()).digest('hex');

export const generateRecoveryCode = (): string => {
  const bytes = randomBytes(RECOVERY_SEGMENT * 2);
  const chars = [...bytes].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length] ?? 'x');
  return `${chars.slice(0, RECOVERY_SEGMENT).join('')}-${chars.slice(RECOVERY_SEGMENT).join('')}`;
};

const checkTotp = (deps: Deps, user: User, code: string): boolean => {
  if (user.totpSecret === null || !TOTP_PATTERN.test(code)) return false;
  return totp
    .clone({ epoch: deps.now().getTime() })
    .verify({ token: code, secret: deps.keys.decrypt(user.totpSecret) });
};

const consumeRecoveryCode = async (deps: Deps, user: User, code: string): Promise<boolean> => {
  if (!RECOVERY_CODE_PATTERN.test(code)) return false;
  const hash = hashRecoveryCode(code);
  if (!user.mfaRecoveryCodes.includes(hash)) return false;
  await deps.prisma.user.update({
    where: { id: user.id },
    data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== hash) },
  });
  return true;
};

const enrol = async (deps: Deps, userId: string): Promise<Enrolment> => {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled) throw new AppError('CONFLICT', 'MFA is already enabled for this account');
  const secret = totp.generateSecret();
  const otpauthUrl = totp.keyuri(user.email, brand.name, secret);
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await deps.prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: deps.keys.encrypt(secret),
      mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
    },
  });
  return { secret, otpauthUrl, qrDataUrl: await toDataURL(otpauthUrl), recoveryCodes };
};

const verify = async (deps: Deps, userId: string, code: string): Promise<User> => {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ok = checkTotp(deps, user, code) || (await consumeRecoveryCode(deps, user, code));
  if (!ok) {
    deps.events.record('auth.mfa.failed', { userId });
    throw new AppError('INVALID_OTP', 'Invalid authentication code');
  }
  if (user.mfaEnabled) return user;
  deps.events.record('auth.mfa.enrolled', { userId });
  return deps.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
};

const verifyTotp = async (deps: Deps, userId: string, code: string): Promise<User> => {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!checkTotp(deps, user, code)) {
    deps.events.record('auth.mfa.failed', { userId, stepUp: true });
    throw new AppError('INVALID_OTP', 'Invalid authentication code');
  }
  return user;
};

export const createMfaService = (options: MfaServiceDeps): MfaService => {
  const deps: Deps = { ...options, now: options.now ?? (() => new Date()) };
  return {
    enrol: (userId) => enrol(deps, userId),
    verify: (userId, code) => verify(deps, userId, code),
    verifyTotp: (userId, code) => verifyTotp(deps, userId, code),
  };
};
