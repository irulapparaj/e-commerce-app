/**
 * DPDP erasure service — implements the "right to erasure" for a customer account.
 */
import { Prisma } from '@prisma/client';
import { AppError } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';
import { recordAudit } from '../audit/record';
import type { SecurityEvents } from '../auth/security-events';
import type { UserStateCache } from '../auth/user-state';
import { ACTIVE_ORDER_STATUSES } from '../customers/detail.dto';
import { hashEmail } from '../notifications/suppression';

const PII_SCRUB_KEYS = new Set(['email', 'contact']);

const scrubPii = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(scrubPii);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (!PII_SCRUB_KEYS.has(key)) result[key] = scrubPii(val);
    }
    return result;
  }
  return value;
};

export interface EraseResult {
  readonly userId: string;
  readonly erasedAt: Date;
  readonly retained: { readonly orders: number };
  readonly scrubbed: { readonly webhookEvents: number };
}

export const createEraseService = (prisma: PrismaDb, keys: KeyProvider) => {
  const eraseCustomer = async (
    userId: string,
    options: {
      source: 'SELF' | 'ADMIN';
      reason: string | null;
      actorId: string | null;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<EraseResult> => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user === null) throw new AppError('NOT_FOUND', 'User not found');
    if (user.role !== 'CUSTOMER') throw new AppError('FORBIDDEN', 'Only customer accounts may be erased');
    if (user.deletedAt !== null) throw new AppError('CONFLICT', 'This customer has already been erased');

    const activeOrderCount = await prisma.order.count({
      where: { userId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    });
    if (activeOrderCount > 0) {
      throw new AppError('ERASE_BLOCKED_ACTIVE_ORDERS', undefined, {
        details: { activeOrders: activeOrderCount },
      });
    }

    const email = user.email;
    const hash = hashEmail(keys, email);
    const now = new Date();
    const anonymisedEmail = `deleted+${userId}@anon.invalid`;

    return prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          email: anonymisedEmail,
          name: 'Deleted user',
          isDisabled: true,
          phone: null,
          phoneHmac: null,
          totpSecret: null,
          mfaRecoveryCodes: [],
        },
      });

      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.wishlistItem.deleteMany({ where: { userId } });

      const orders = await tx.order.findMany({
        where: { userId },
        select: { id: true, shippingAddress: true, razorpayPaymentId: true },
      });

      for (const order of orders) {
        const addr = order.shippingAddress as Record<string, unknown> | null;
        const scrubbed = addr
          ? { city: addr['city'], state: addr['state'], pincode: addr['pincode'] }
          : {};
        await tx.order.update({
          where: { id: order.id },
          data: { email: anonymisedEmail, phone: '', shippingAddress: scrubbed },
        });
      }

      const paymentIds = orders
        .map((o) => o.razorpayPaymentId)
        .filter((id): id is string => id !== null);

      let webhookEventsScrubbed = 0;
      if (paymentIds.length > 0) {
        const allEvents = await tx.webhookEvent.findMany({
          select: { id: true, payload: true },
        });
        const relevant = allEvents.filter((evt) => {
          const str = JSON.stringify(evt.payload);
          return paymentIds.some((pid) => str.includes(pid));
        });
        for (const evt of relevant) {
          await tx.webhookEvent.update({
            where: { id: evt.id },
            data: { payload: scrubPii(evt.payload) as Prisma.InputJsonValue },
          });
          webhookEventsScrubbed++;
        }
      }

      await tx.newsletterSubscriber.updateMany({
        where: { emailHash: hash },
        data: { emailEncrypted: { set: null }, unsubscribedAt: now },
      });

      await tx.emailSuppression.upsert({
        where: { emailHash: hash },
        create: { emailHash: hash, reason: 'UNSUBSCRIBE' },
        update: { reason: 'UNSUBSCRIBE' },
      });

      const retainedOrders = orders.length;
      await recordAudit(tx, {
        actorId: options.actorId,
        ip: options.ip,
        userAgent: options.userAgent,
        action: 'customer.erased',
        entityType: 'user',
        entityId: userId,
        after: {
          source: options.source,
          reason: options.reason,
          retained: { orders: retainedOrders },
          scrubbed: { webhookEvents: webhookEventsScrubbed },
        },
      });

      return { userId, erasedAt: now, retained: { orders: retainedOrders }, scrubbed: { webhookEvents: webhookEventsScrubbed } };
    });
  };

  return { eraseCustomer };
};

export type EraseService = ReturnType<typeof createEraseService>;

interface EraseDeps {
  readonly prisma: PrismaDb;
  readonly userState: UserStateCache;
  readonly events: SecurityEvents;
  readonly keys: KeyProvider;
}

interface EraseOptions {
  readonly actor: { actorId: string | null; ip: string | null; userAgent: string | null };
  readonly source: 'SELF' | 'ADMIN';
  readonly reason: string | null;
}

export const eraseUser = async (
  deps: EraseDeps,
  userId: string,
  options: EraseOptions,
): Promise<EraseResult> => {
  const svc = createEraseService(deps.prisma, deps.keys);
  const result = await svc.eraseCustomer(userId, {
    source: options.source,
    reason: options.reason,
    actorId: options.actor.actorId,
    ip: options.actor.ip,
    userAgent: options.actor.userAgent,
  });
  deps.userState.invalidate(userId);
  deps.events.record('customer.erased', {
    userId,
    source: options.source,
    actorId: options.actor.actorId,
  });
  return result;
};
