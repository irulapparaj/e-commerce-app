import { AppError } from '@pe/shared';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

import type { PrismaDb, PrismaTx } from '../../db/prisma';

import type { OrderHooks } from './hooks';

type StatusTx = Pick<PrismaTx, 'order' | 'orderStatusEvent' | '$queryRaw'>;

interface MarkPaidDeps {
  readonly hooks: OrderHooks;
}

/** Idempotent: unique constraint on razorpayPaymentId prevents double-application. */
export const markPaid = async (
  prisma: Pick<PrismaDb, 'order' | 'orderStatusEvent' | '$transaction'>,
  orderId: string,
  razorpayPaymentId: string,
  deps: MarkPaidDeps,
): Promise<void> => {
  let userId: string | null = null;

  await prisma.$transaction(async (tx: StatusTx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        payment_status: string;
        user_id: string;
        razorpay_payment_id: string | null;
      }>
    >`SELECT id, status, payment_status, user_id, razorpay_payment_id FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`;

    const order = rows[0];
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');

    // Idempotent: already paid with the same payment id
    if (order.razorpay_payment_id === razorpayPaymentId && order.payment_status === 'PAID') return;

    if (order.status === 'CANCELLED') {
      throw new AppError('CONFLICT', 'Cannot mark a cancelled order as paid');
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CONFIRMED' as OrderStatus,
        paymentStatus: 'PAID' as PaymentStatus,
        razorpayPaymentId,
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId,
        status: 'CONFIRMED' as OrderStatus,
        note: `Payment captured: ${razorpayPaymentId}`,
        source: 'WEBHOOK',
      },
    });

    userId = order.user_id;
  });

  // Emit hooks outside the transaction so a hook failure cannot roll back the payment record.
  if (userId !== null) {
    await deps.hooks.emitOrderPaid({ orderId, userId, razorpayPaymentId });
  }
};

/** Appends a CANCELLED event; idempotent if already cancelled. */
export const markCancelled = async (
  prisma: Pick<PrismaDb, 'order' | 'orderStatusEvent' | '$transaction'>,
  orderId: string,
  note: string | null,
  deps: MarkPaidDeps,
): Promise<void> => {
  let userId: string | null = null;

  await prisma.$transaction(async (tx: StatusTx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; status: string; payment_status: string; user_id: string }>
    >`SELECT id, status, payment_status, user_id FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`;

    const order = rows[0];
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status === 'CANCELLED') return; // idempotent
    // Never cancel a paid order — if payment arrived between the release check and this call, abort
    if (order.payment_status === 'PAID') return;

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' as OrderStatus },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId,
        status: 'CANCELLED' as OrderStatus,
        note,
        source: 'SYSTEM',
      },
    });

    userId = order.user_id;
  });

  // Emit hooks outside the transaction so a hook failure cannot roll back the cancellation record.
  if (userId !== null) {
    await deps.hooks.emitOrderCancelled({ orderId, userId, note });
  }
};
