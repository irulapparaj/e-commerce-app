import { AppError } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import { RateLimitedError, type RateLimiter } from '../../plugins/rate-limit';
import { type AuditActor, recordAudit } from '../audit/record';
import type { SecurityEvents } from '../auth/security-events';
import type { TokenService } from '../auth/token.service';
import type { SecurityCounters } from '../security-events/counters';

import { CUSTOMER_DETAIL_SELECT, type PiiDto, toPiiDto } from './detail.dto';

/** DESIGN §11.3: PII reveal 30 / day / staff, alert above. */
export const REVEAL_RATE_LIMIT = { limit: 30, windowSeconds: 86_400 } as const;

export interface RevealServiceDeps {
  readonly prisma: PrismaDb;
  readonly tokens: TokenService;
  readonly rateLimiter: RateLimiter;
  readonly counters: SecurityCounters;
  readonly events: SecurityEvents;
  readonly ttlSeconds: number;
  readonly now?: () => Date;
}

export interface RevealGrant {
  readonly revealToken: string;
  readonly expiresAt: string;
}

export interface RevealService {
  /** ADMIN ⚡ with a reason: audited, rate limited, returns a token bound to actor + customer. */
  issue(customerId: string, reason: string, actor: AuditActor): Promise<RevealGrant>;
  /** Exchanges a live token for the plaintext; every read is audited. */
  read(customerId: string, token: string, actor: AuditActor): Promise<PiiDto>;
}

export const createRevealService = (deps: RevealServiceDeps): RevealService => {
  const now = deps.now ?? (() => new Date());

  const loadCustomer = async (customerId: string) => {
    const user = await deps.prisma.user.findFirst({
      where: { id: customerId, role: 'CUSTOMER' },
      select: CUSTOMER_DETAIL_SELECT,
    });
    if (user === null) throw new AppError('NOT_FOUND', 'Customer not found');
    return user;
  };

  const consumeLimit = async (actorId: string): Promise<void> => {
    try {
      await deps.rateLimiter.consume([{ key: `pii-reveal:${actorId}`, ...REVEAL_RATE_LIMIT }]);
    } catch (error) {
      if (error instanceof RateLimitedError)
        await deps.counters.increment('customer.pii.reveal.limited');
      throw error;
    }
  };

  const issue: RevealService['issue'] = async (customerId, reason, actor) => {
    if (actor.actorId === null) throw new AppError('UNAUTHENTICATED');
    await loadCustomer(customerId);
    await consumeLimit(actor.actorId);
    const revealToken = await deps.tokens.signReveal(
      { actorId: actor.actorId, customerId },
      deps.ttlSeconds,
    );
    const expiresAt = new Date(now().getTime() + deps.ttlSeconds * 1000).toISOString();
    await recordAudit(deps.prisma, {
      ...actor,
      action: 'customer.pii.reveal',
      entityType: 'user',
      entityId: customerId,
      after: { reason, expiresAt },
    });
    deps.events.record('customer.pii.revealed', { actorId: actor.actorId, customerId });
    return { revealToken, expiresAt };
  };

  const read: RevealService['read'] = async (customerId, token, actor) => {
    const claims = await deps.tokens.verifyReveal(token);
    if (claims.customerId !== customerId || claims.actorId !== actor.actorId)
      throw new AppError('REVEAL_EXPIRED');
    const user = await loadCustomer(customerId);
    await recordAudit(deps.prisma, {
      ...actor,
      action: 'customer.pii.read',
      entityType: 'user',
      entityId: customerId,
      after: { tokenId: claims.jti },
    });
    deps.events.record('customer.pii.read', { actorId: actor.actorId, customerId });
    return toPiiDto(user);
  };

  return { issue, read };
};
