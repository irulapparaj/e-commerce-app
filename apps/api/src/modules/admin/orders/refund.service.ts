import { AppError } from '@pe/shared';
import type { OrderStatus } from '@prisma/client';

import type { PrismaDb, PrismaTx } from '../../../db/prisma';
import type { AuditActor } from '../../audit/record';
import { recordAudit } from '../../audit/record';
import type { RazorpayClient } from '../../payments/razorpay.client';

const MIN_REASON_LENGTH = 10;
/** Generous budget: the Razorpay call (10 s fetch timeout) runs while the order row is locked. */
const REFUND_TX_TIMEOUT_MS = 20_000;

export interface RefundOrderInput {
  readonly orderId: string;
  readonly amountPaise: number;
  readonly reason: string;
  readonly actor: AuditActor;
}

export interface RefundOrderDeps {
  readonly prisma: PrismaDb;
  readonly razorpay: RazorpayClient;
}

export interface RefundResult {
  readonly refundId: string;
  readonly status: 'INITIATED';
}

type RefundTx = Pick<PrismaTx, '$queryRaw' | 'order' | 'orderStatusEvent' | 'auditLog'>;

/**
 * The refund sequence is the paise already initiated when this refund starts. Because it only
 * changes under the row lock, a retry of the same logical refund (after an ambiguous failure)
 * reuses the same key and Razorpay replays the original refund instead of paying out twice.
 */
export const refundIdempotencyKey = (orderId: string, alreadyRefundedPaise: number): string =>
  `rfnd-${orderId}-${alreadyRefundedPaise}`;

/**
 * Initiates a partial or full refund via Razorpay (review fix C-2).
 *
 * Rules:
 * - `amountPaise` must be > 0 and ≤ total − refundedAmount, both read under `FOR UPDATE` so
 *   concurrent submissions serialize and the second sees the first one's accounting.
 * - `refundedAmount` on the order is the sole source of truth for the cap; status-event notes
 *   are informational only.
 * - The Razorpay call runs inside the transaction while the order row is locked, carrying a
 *   deterministic idempotency key; if the transaction then fails, the retry replays the same
 *   refund at Razorpay rather than creating a second one.
 * - Returns 202 INITIATED only; REFUNDED status is set by the refund.processed webhook (P12).
 * - Requires ADMIN + step-up (enforced by the route).
 */
export const refundOrder = async (
  input: RefundOrderInput,
  deps: RefundOrderDeps,
): Promise<RefundResult> => {
  const { prisma, razorpay } = deps;

  if (input.reason.length < MIN_REASON_LENGTH) {
    throw new AppError('VALIDATION', `Refund reason must be at least ${MIN_REASON_LENGTH} characters`);
  }
  if (input.amountPaise <= 0) {
    throw new AppError('VALIDATION', 'Refund amount must be positive');
  }

  return prisma.$transaction(
    async (tx: RefundTx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          total: number;
          refunded_amount: number;
          razorpay_payment_id: string | null;
        }>
      >`SELECT id, status, total, refunded_amount, razorpay_payment_id FROM "order" WHERE id = ${input.orderId}::uuid FOR UPDATE`;

      const order = rows[0];
      if (order === undefined) throw new AppError('NOT_FOUND', 'Order not found');

      if (order.razorpay_payment_id === null) {
        throw new AppError('CONFLICT', 'No payment captured for this order; cannot refund');
      }

      const refundableAmount = order.total - order.refunded_amount;
      if (input.amountPaise > refundableAmount) {
        throw new AppError(
          'REFUND_EXCEEDS_CAPTURED',
          `Refund amount ${input.amountPaise} exceeds refundable amount ${refundableAmount} (captured: ${order.total}, already initiated: ${order.refunded_amount})`,
        );
      }

      const rpRefund = await razorpay.createRefund(
        order.razorpay_payment_id,
        input.amountPaise,
        { reason: input.reason, orderId: input.orderId },
        { idempotencyKey: refundIdempotencyKey(input.orderId, order.refunded_amount) },
      );

      await tx.order.update({
        where: { id: input.orderId },
        data: { refundedAmount: { increment: input.amountPaise } },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: input.orderId,
          status: order.status as OrderStatus,
          note: `Refund initiated: ${rpRefund.id}, amount: ${input.amountPaise} paise, reason: ${input.reason}`,
          source: 'ADMIN',
          actorId: input.actor.actorId,
        },
      });

      await recordAudit(tx, {
        ...input.actor,
        action: 'order.refund_initiated',
        entityType: 'order',
        entityId: input.orderId,
        after: {
          refundId: rpRefund.id,
          amountPaise: input.amountPaise,
          reason: input.reason,
          razorpayStatus: rpRefund.status,
        },
      });

      return { refundId: rpRefund.id, status: 'INITIATED' as const };
    },
    { timeout: REFUND_TX_TIMEOUT_MS },
  );
};
