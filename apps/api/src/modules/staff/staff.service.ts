import { AppError } from '@pe/shared';
import type { Role, User } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { EmailPort } from '../../ports/email';
import type { KeyProvider } from '../../ports/key-provider';
import { type AuditActor, recordAudit } from '../audit/record';
import type { RefreshService } from '../auth/refresh.service';
import type { SecurityEvents } from '../auth/security-events';
import type { UserStateCache } from '../auth/user-state';
import { sendNow } from '../notifications';

export type StaffRole = Extract<Role, 'ADMIN' | 'STAFF'>;

export interface StaffRow {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: StaffRole;
  readonly mfaEnabled: boolean;
  readonly isDisabled: boolean;
  readonly lastLoginAt: string | null;
  readonly sessionCount: number;
  readonly createdAt: string;
}

export interface StaffServiceDeps {
  readonly prisma: PrismaDb;
  readonly refresh: RefreshService;
  readonly userState: UserStateCache;
  readonly email: EmailPort;
  readonly events: SecurityEvents;
  readonly adminLoginUrl: string;
  readonly keys: KeyProvider;
  readonly now?: () => Date;
}

export interface StaffService {
  list(): Promise<readonly StaffRow[]>;
  changeRole(targetId: string, role: StaffRole, actor: AuditActor): Promise<User>;
  resetMfa(targetId: string, actor: AuditActor): Promise<User>;
  revokeSessions(targetId: string, actor: AuditActor): Promise<number>;
}

const STAFF_ROLES: readonly Role[] = ['ADMIN', 'STAFF'];

export const toStaffRow = (
  user: User,
  lastLoginAt: Date | null,
  sessionCount: number,
): StaffRow => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role as StaffRole,
  mfaEnabled: user.mfaEnabled,
  isDisabled: user.isDisabled,
  lastLoginAt: lastLoginAt?.toISOString() ?? null,
  sessionCount,
  createdAt: user.createdAt.toISOString(),
});

/** P05 task 3. Every mutation revokes the target's sessions and writes an audit row. */
export const createStaffService = (deps: StaffServiceDeps): StaffService => {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());

  const loadStaff = async (id: string): Promise<User> => {
    const user = await prisma.user.findFirst({
      where: { id, role: { in: [...STAFF_ROLES] }, deletedAt: null },
    });
    if (user === null) throw new AppError('NOT_FOUND', 'Staff member not found');
    return user;
  };

  const list: StaffService['list'] = async () => {
    const at = now();
    const users = await prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] }, deletedAt: null },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        refreshTokens: {
          where: { audience: 'ADMIN' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: {
            refreshTokens: { where: { revokedAt: null, expiresAt: { gt: at }, audience: 'ADMIN' } },
          },
        },
      },
    });
    return users.map((user) =>
      toStaffRow(user, user.refreshTokens[0]?.createdAt ?? null, user._count.refreshTokens),
    );
  };

  const activeAdmins = () =>
    prisma.user.count({ where: { role: 'ADMIN', isDisabled: false, deletedAt: null } });

  const changeRole: StaffService['changeRole'] = async (targetId, role, actor) => {
    const target = await loadStaff(targetId);
    if (target.role === 'ADMIN' && role !== 'ADMIN' && (await activeAdmins()) <= 1) {
      throw new AppError('CONFLICT', 'Cannot demote the last active admin');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: targetId }, data: { role } });
      await recordAudit(tx, {
        ...actor,
        action: 'staff.role_changed',
        entityType: 'user',
        entityId: targetId,
        before: { role: target.role },
        after: { role },
      });
      return user;
    });
    await deps.refresh.revokeAll(targetId);
    deps.userState.invalidate(targetId);
    deps.events.record('auth.staff.role_changed', {
      userId: targetId,
      from: target.role,
      to: role,
      actorId: actor.actorId,
    });
    return updated;
  };

  const resetMfa: StaffService['resetMfa'] = async (targetId, actor) => {
    const target = await loadStaff(targetId);
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetId },
        data: { totpSecret: null, mfaRecoveryCodes: [], mfaEnabled: false },
      });
      await recordAudit(tx, {
        ...actor,
        action: 'staff.mfa_reset',
        entityType: 'user',
        entityId: targetId,
        before: { mfaEnabled: target.mfaEnabled },
        after: { mfaEnabled: false },
      });
      return user;
    });
    await deps.refresh.revokeAll(targetId);
    deps.userState.invalidate(targetId);
    await sendNow(
      { prisma: deps.prisma, email: deps.email, keys: deps.keys },
      'mfa-reenrol',
      target.email,
      { name: target.name ?? target.email, loginUrl: deps.adminLoginUrl },
    );
    deps.events.record('auth.staff.mfa_reset', { userId: targetId, actorId: actor.actorId });
    return updated;
  };

  const revokeSessions: StaffService['revokeSessions'] = async (targetId, actor) => {
    await loadStaff(targetId);
    const revoked = await deps.refresh.revokeAll(targetId);
    await recordAudit(prisma, {
      ...actor,
      action: 'staff.sessions_revoked',
      entityType: 'user',
      entityId: targetId,
      after: { revoked },
    });
    deps.events.record('auth.staff.sessions_revoked', {
      userId: targetId,
      revoked,
      actorId: actor.actorId,
    });
    return revoked;
  };

  return { list, changeRole, resetMfa, revokeSessions };
};
