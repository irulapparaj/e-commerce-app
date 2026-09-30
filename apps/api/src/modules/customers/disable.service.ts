import { AppError } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import { type AuditActor, recordAudit } from '../audit/record';
import type { RefreshService } from '../auth/refresh.service';
import type { SecurityEvents } from '../auth/security-events';
import type { UserStateCache } from '../auth/user-state';

import {
  ACTIVE_ORDER_STATUSES,
  CUSTOMER_DETAIL_SELECT,
  type CustomerDetailDto,
  toCustomerDetail,
} from './detail.dto';

export interface CustomerServiceDeps {
  readonly prisma: PrismaDb;
  readonly refresh: RefreshService;
  readonly userState: UserStateCache;
  readonly events: SecurityEvents;
}

export interface CustomerService {
  detail(customerId: string): Promise<CustomerDetailDto>;
  /** ADMIN ⚡: flags the account, revokes every session, audits the reason (P08 task 5). */
  disable(customerId: string, reason: string, actor: AuditActor): Promise<CustomerDetailDto>;
  enable(customerId: string, actor: AuditActor): Promise<CustomerDetailDto>;
  revokeSession(customerId: string, sessionId: string, actor: AuditActor): Promise<boolean>;
}

export const createCustomerService = (deps: CustomerServiceDeps): CustomerService => {
  const load = async (customerId: string) => {
    const user = await deps.prisma.user.findFirst({
      where: { id: customerId, role: 'CUSTOMER' },
      select: CUSTOMER_DETAIL_SELECT,
    });
    if (user === null) throw new AppError('NOT_FOUND', 'Customer not found');
    return user;
  };

  const detail: CustomerService['detail'] = async (customerId) => {
    const user = await load(customerId);
    const [sessions, activeOrders] = await Promise.all([
      deps.refresh.listSessions(customerId),
      deps.prisma.order.count({
        where: { userId: customerId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      }),
    ]);
    return toCustomerDetail(user, {
      sessionCount: sessions.length,
      lastSeen: sessions[0]?.lastUsedAt ?? null,
      activeOrders,
    });
  };

  const setDisabled = async (
    customerId: string,
    isDisabled: boolean,
    actor: AuditActor,
    reason: string | null,
  ): Promise<CustomerDetailDto> => {
    const user = await load(customerId);
    if (user.deletedAt !== null) throw new AppError('CONFLICT', 'This customer has been erased');
    await deps.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: customerId }, data: { isDisabled } });
      await recordAudit(tx, {
        ...actor,
        action: isDisabled ? 'customer.disabled' : 'customer.enabled',
        entityType: 'user',
        entityId: customerId,
        before: { isDisabled: user.isDisabled },
        after: { isDisabled, ...(reason === null ? {} : { reason }) },
      });
    });
    deps.userState.invalidate(customerId);
    if (isDisabled) await deps.refresh.revokeAll(customerId);
    deps.events.record(isDisabled ? 'customer.disabled' : 'customer.enabled', {
      customerId,
      actorId: actor.actorId,
    });
    return detail(customerId);
  };

  const revokeSession: CustomerService['revokeSession'] = async (customerId, sessionId, actor) => {
    await load(customerId);
    const revoked = await deps.refresh.revokeSession(customerId, sessionId);
    if (!revoked) throw new AppError('NOT_FOUND', 'Session not found');
    await recordAudit(deps.prisma, {
      ...actor,
      action: 'customer.session_revoked',
      entityType: 'session',
      entityId: sessionId,
      after: { customerId },
    });
    deps.events.record('customer.session.revoked', {
      customerId,
      sessionId,
      actorId: actor.actorId,
    });
    return true;
  };

  return {
    detail,
    disable: (customerId, reason, actor) => setDisabled(customerId, true, actor, reason),
    enable: (customerId, actor) => setDisabled(customerId, false, actor, null),
    revokeSession,
  };
};
