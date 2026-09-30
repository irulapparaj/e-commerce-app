import { AppError } from '@pe/shared';
import type { OrderStatus } from '@prisma/client';

import type { PrismaDb, PrismaTx } from '../../../db/prisma';
import type { AuditActor } from '../../audit/record';
import { recordAudit } from '../../audit/record';
import { applyMovement } from '../../inventory/apply-movement';
import type { OrderHooks } from '../../orders/hooks';

import { cancelEligible } from './transitions';

export interface CancelOrderInput {
  readonly orderId: string;
  readonly note?: string;
  readonly actor: AuditActor;
}

export interface CancelOrderDeps {
  readonly prisma: PrismaDb;
  readonly hooks: OrderHooks;
}

type CancelTx = Pick<PrismaTx, 'order' | 'orderStatusEvent' | 'orderItem' | 'auditLog' | '$queryRaw' | 'stockMovement' | 'productVariant'>;

/**
 * Cancels an order before dispatch:
 * - Validates cancel eligibility (before DISPATCHED) inside the transaction under a row lock.
 * - Updates status to CANCELLED.
 * - Releases reserved stock (ORDER_RELEASE movements).
 * - Appends OrderStatusEvent.
 * - Audits the action.
 * - Emits onOrderCancelled hook (which triggers refund if PAID, via P12).
 */
export const cancelOrder = async (
  input: CancelOrderInput,
  deps: CancelOrderDeps,
): Promise<void> => {
  const { prisma, hooks } = deps;

  const note = input.note ?? null;

  let cancelledUserId: string | undefined;
  let wasAlreadyCancelled = false;

  await prisma.$transaction(async (tx: CancelTx) => {
    // Lock the order row first to prevent concurrent payment/cancellation races.
    const rows = await tx.$queryRaw<
      Array<{ id: string; status: string; payment_status: string; user_id: string }>
    >`SELECT id, status, payment_status, user_id FROM "order" WHERE id = ${input.orderId}::uuid FOR UPDATE`;

    const order = rows[0];

    if (order === undefined) throw new AppError('NOT_FOUND', 'Order not found');

    if (order.status === 'CANCELLED') {
      wasAlreadyCancelled = true;
      return; // idempotent
    }

    // H-04: PAID orders must be refunded first before cancellation
    if (order.payment_status === 'PAID') {
      throw new AppError('CONFLICT', 'Cannot cancel a paid order; issue a refund first');
    }

    if (!cancelEligible(order.status as OrderStatus)) {
      throw new AppError(
        'CONFLICT',
        `Order cannot be cancelled at status ${order.status}; only orders before DISPATCHED can be cancelled`,
      );
    }

    await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'CANCELLED' as OrderStatus },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: input.orderId,
        status: 'CANCELLED' as OrderStatus,
        note,
        source: 'ADMIN',
        actorId: input.actor.actorId,
      },
    });

    // Fetch items inside the transaction so they are read consistently.
    // H-05: sort by variantId for consistent lock order to prevent deadlocks
    const items = await tx.orderItem.findMany({
      where: { orderId: input.orderId },
      select: { variantId: true, quantity: true },
      orderBy: { variantId: 'asc' },
    });

    // Release reserved stock
    for (const item of items) {
      await applyMovement(
        {
          variantId: item.variantId,
          delta: item.quantity,
          reason: 'ORDER_RELEASE',
          referenceId: input.orderId,
          ...(input.actor.actorId != null ? { actorId: input.actor.actorId } : {}),
          note: `Cancel order ${input.orderId}`,
        },
        tx,
      );
    }

    await recordAudit(tx, {
      ...input.actor,
      action: 'order.cancelled',
      entityType: 'order',
      entityId: input.orderId,
      before: { status: order.status, paymentStatus: order.payment_status },
      after: { status: 'CANCELLED', note },
    });

    cancelledUserId = order.user_id;
  });

  // Idempotent: already cancelled before the transaction — no hook re-emit.
  if (wasAlreadyCancelled) return;

  if (cancelledUserId !== undefined) {
    await hooks.emitOrderCancelled({
      orderId: input.orderId,
      userId: cancelledUserId,
      note,
    });
  }
};
