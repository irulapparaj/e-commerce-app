import { randomBytes, randomUUID } from 'node:crypto';

import { AppError } from '@pe/shared';
import type { RefreshAudience, RefreshToken, Role, User } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

import type { AuthHooks } from './hooks';
import { absoluteExpiry, decideRotation, generateRawToken, hashToken } from './refresh-state';
import type { SecurityEvents } from './security-events';
import type { Audience, TokenService } from './token.service';

const CSRF_BYTES = 32;

export type SessionAudience = Exclude<Audience, 'mfa'>;

export interface SessionMeta {
  readonly ip: string;
  readonly userAgent: string | null;
  readonly previousSessionId?: string | null;
}

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role;
  readonly mfaEnabled: boolean;
}

export interface Session {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly sessionId: string;
  readonly audience: SessionAudience;
  readonly user: PublicUser;
}

export interface SessionSummary {
  readonly id: string;
  readonly audience: RefreshAudience;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
}

export interface RefreshService {
  issueSession(user: User, audience: SessionAudience, meta: SessionMeta): Promise<Session>;
  rotate(rawToken: string, meta: SessionMeta): Promise<Session>;
  revoke(rawToken: string): Promise<void>;
  revokeAll(userId: string): Promise<number>;
  listSessions(userId: string): Promise<readonly SessionSummary[]>;
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
}

export interface RefreshServiceDeps {
  readonly prisma: PrismaDb;
  readonly tokens: TokenService;
  readonly hooks: AuthHooks;
  readonly events: SecurityEvents;
  readonly now?: () => Date;
}

type Deps = Required<RefreshServiceDeps>;

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  mfaEnabled: user.mfaEnabled,
});

const toRefreshAudience = (audience: SessionAudience): RefreshAudience =>
  audience === 'admin' ? 'ADMIN' : 'STOREFRONT';
const toSessionAudience = (audience: RefreshAudience): SessionAudience =>
  audience === 'ADMIN' ? 'admin' : 'storefront';

const buildSession = async (
  deps: Deps,
  user: User,
  audience: SessionAudience,
  rawToken: string,
  sessionId: string,
): Promise<Session> => ({
  accessToken: await deps.tokens.signAccess({ sub: user.id, role: user.role, aud: audience }),
  refreshToken: rawToken,
  csrfToken: randomBytes(CSRF_BYTES).toString('base64url'),
  sessionId,
  audience,
  user: toPublicUser(user),
});

const revokeFamily = (deps: Deps, familyId: string) =>
  deps.prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: deps.now() },
  });

const issueSession = async (
  deps: Deps,
  user: User,
  audience: SessionAudience,
  meta: SessionMeta,
): Promise<Session> => {
  const raw = generateRawToken();
  const at = deps.now();
  const refreshAudience = toRefreshAudience(audience);
  const row = await deps.prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      audience: refreshAudience,
      tokenHash: hashToken(raw),
      expiresAt: absoluteExpiry(refreshAudience, at),
      lastUsedAt: at,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    select: { id: true },
  });
  deps.events.record('auth.login', { userId: user.id, audience, ip: meta.ip });
  await deps.hooks.emitLogin({
    userId: user.id,
    sessionId: row.id,
    previousSessionId: meta.previousSessionId ?? null,
  });
  return buildSession(deps, user, audience, raw, row.id);
};

/** Marks the presented token used and creates its successor in the same family, keeping the absolute expiry. */
const replaceToken = (deps: Deps, record: RefreshToken, raw: string, meta: SessionMeta) =>
  deps.prisma.$transaction(async (tx) => {
    const at = deps.now();
    await tx.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: at, lastUsedAt: at },
    });
    return tx.refreshToken.create({
      data: {
        userId: record.userId,
        familyId: record.familyId,
        audience: record.audience,
        tokenHash: hashToken(raw),
        expiresAt: record.expiresAt,
        lastUsedAt: at,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
      select: { id: true },
    });
  });

const rotate = async (deps: Deps, rawToken: string, meta: SessionMeta): Promise<Session> => {
  const record = await deps.prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (record === null) throw new AppError('UNAUTHENTICATED');
  const decision = decideRotation(record, deps.now());
  if (decision.action === 'revoke-family') {
    await revokeFamily(deps, record.familyId);
    deps.events.record('auth.refresh.reuse_detected', {
      userId: record.userId,
      familyId: record.familyId,
      ip: meta.ip,
    });
    throw new AppError('UNAUTHENTICATED');
  }
  if (decision.action === 'revoke' || record.user.isDisabled || record.user.deletedAt !== null) {
    await revokeFamily(deps, record.familyId);
    deps.events.record('auth.refresh.expired', {
      userId: record.userId,
      reason: decision.action === 'revoke' ? decision.reason : 'disabled',
    });
    throw new AppError('UNAUTHENTICATED');
  }
  const raw = generateRawToken();
  const next = await replaceToken(deps, record, raw, meta);
  deps.events.record('auth.refresh.rotated', { userId: record.userId, familyId: record.familyId });
  return buildSession(deps, record.user, toSessionAudience(record.audience), raw, next.id);
};

const revoke = async (deps: Deps, rawToken: string): Promise<void> => {
  const record = await deps.prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { familyId: true, userId: true },
  });
  if (record === null) return;
  await revokeFamily(deps, record.familyId);
  deps.events.record('auth.logout', { userId: record.userId });
};

const revokeAll = async (deps: Deps, userId: string): Promise<number> => {
  const result = await deps.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: deps.now() },
  });
  deps.events.record('auth.logout', { userId, all: true, count: result.count });
  return result.count;
};

const listSessions = (deps: Deps, userId: string): Promise<SessionSummary[]> =>
  deps.prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: deps.now() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      audience: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

const revokeSession = async (deps: Deps, userId: string, sessionId: string): Promise<boolean> => {
  const record = await deps.prisma.refreshToken.findFirst({
    where: { id: sessionId, userId },
    select: { familyId: true },
  });
  if (record === null) return false;
  return (await revokeFamily(deps, record.familyId)).count > 0;
};

export const createRefreshService = (options: RefreshServiceDeps): RefreshService => {
  const deps: Deps = { ...options, now: options.now ?? (() => new Date()) };
  return {
    issueSession: (user, audience, meta) => issueSession(deps, user, audience, meta),
    rotate: (rawToken, meta) => rotate(deps, rawToken, meta),
    revoke: (rawToken) => revoke(deps, rawToken),
    revokeAll: (userId) => revokeAll(deps, userId),
    listSessions: (userId) => listSessions(deps, userId),
    revokeSession: (userId, sessionId) => revokeSession(deps, userId, sessionId),
  };
};
