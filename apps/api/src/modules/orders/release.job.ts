import type { OrderStatus } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import type { PrismaDb, PrismaTx } from '../../db/prisma';
import type { JobQueue } from '../../jobs/queue';
import { applyMovement } from '../inventory/apply-movement';

import type { OrderHooks } from './hooks';

export interface OrderReleaseDeps {
  readonly prisma: PrismaDb;
  readonly jobs: JobQueue;
  readonly hooks: OrderHooks;
  readonly log: FastifyBaseLogger;
}

type ReleaseTx = Pick<
  PrismaTx,
  '$queryRaw' | 'order' | 'orderStatusEvent' | 'orderItem' | 'stockMovement' | 'productVariant'
>;

export const runOrderRelease = async (
  deps: OrderReleaseDeps,
  data: { readonly orderId: string },
): Promise<void> => {
  const { prisma, hooks, log } = deps;
  const { orderId } = data;

  let cancelledUserId: string | undefined;

  await prisma.$transaction(async (tx: ReleaseTx) => {
    // Lock the order row to prevent concurrent cancellation / payment races.
    const rows = await tx.$queryRaw<
      Array<{ id: string; status: string; payment_status: string; user_id: string }>
    >`SELECT id, status, payment_status, user_id FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`;

    const order = rows[0];

    if (order === undefined) {
      log.warn({ orderId }, 'order.release: order not found');
      return;
    }

    // No-op if already paid or cancelled (re-checked under the lock).
    if (order.payment_status === 'PAID' || order.status === 'CANCELLED') return;

    // Cancel the order.
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' as OrderStatus },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId,
        status: 'CANCELLED' as OrderStatus,
        note: 'Payment not received within 30 minutes',
        source: 'SYSTEM',
      },
    });

    // Restore reserved stock inside the same transaction.
    // H-05: sort by variantId for consistent lock order to prevent deadlocks
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { variantId: true, quantity: true },
      orderBy: { variantId: 'asc' },
    });

    for (const item of items) {
      await applyMovement(
        {
          variantId: item.variantId,
          delta: item.quantity,
          reason: 'ORDER_RELEASE',
          referenceId: orderId,
        },
        tx,
      );
    }

    cancelledUserId = order.user_id;
  });

  // Emit hook after the transaction commits so listeners see a consistent DB state.
  // The onOrderCancelled hook already queues the cancellation email — no separate job needed.
  if (cancelledUserId !== undefined) {
    await hooks.emitOrderCancelled({
      orderId,
      userId: cancelledUserId,
      note: 'Payment not received within 30 minutes',
    });
  }
};
