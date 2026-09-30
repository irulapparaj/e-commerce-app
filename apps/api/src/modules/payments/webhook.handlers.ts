import { AppError } from '@pe/shared';
import type { FastifyBaseLogger } from 'fastify';

import type { PrismaDb, PrismaTx } from '../../db/prisma';
import type { OrderHooks } from '../orders/hooks';
import { markPaid } from '../orders/status';

import type { RazorpayClient } from './razorpay.client';

/** The Razorpay call (10 s fetch timeout) runs while the order row is locked. */
const RECOVERY_TX_TIMEOUT_MS = 20_000;

export interface WebhookHandlerDeps {
  readonly prisma: PrismaDb;
  readonly hooks: OrderHooks;
  readonly log: FastifyBaseLogger;
  readonly razorpay: RazorpayClient;
}

interface RazorpayPaymentEntity {
  readonly id: string;
  readonly order_id: string;
  readonly status: string;
  readonly amount: number;
}

export interface RazorpayEvent {
  readonly id: string;
  readonly event: string;
  readonly payload: {
    readonly payment?: { readonly entity: RazorpayPaymentEntity };
    readonly refund?: {
      readonly entity: { readonly id: string; readonly payment_id: string; readonly amount: number };
    };
  };
}

type RecoveryTx = Pick<PrismaTx, '$queryRaw' | 'order' | 'orderStatusEvent'>;

/**
 * Capture landed on an order that is already CANCELLED (release job or admin cancel won the
 * race). Without recovery the money is stranded: `razorpayPaymentId` stays NULL so the admin
 * refund endpoint refuses, and the stock has already been resold (review C-1, refund-lockout
 * leg). Recovery persists the payment id, alerts, and auto-initiates a full refund.
 */
const handleCaptureAfterCancel = async (
  deps: WebhookHandlerDeps,
  orderId: string,
  payment: RazorpayPaymentEntity,
): Promise<void> => {
  await deps.prisma.$transaction(
    async (tx: RecoveryTx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; refunded_amount: number; razorpay_payment_id: string | null }>
      >`SELECT id, refunded_amount, razorpay_payment_id FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = rows[0];
      if (order === undefined) return;

      // Make the payment reachable by the admin refund endpoint even if the auto-refund fails.
      if (order.razorpay_payment_id === null) {
        await tx.order.update({ where: { id: orderId }, data: { razorpayPaymentId: payment.id } });
      } else if (order.razorpay_payment_id !== payment.id) {
        deps.log.error(
          { orderId, paymentId: payment.id, existing: order.razorpay_payment_id },
          'ALERT capture-after-cancel: order already holds a different payment id',
        );
        return;
      }

      // A previous attempt (or an admin) already initiated a refund — never pay out twice.
      if (order.refunded_amount > 0) return;

      const refund = await deps.razorpay.createRefund(
        payment.id,
        payment.amount,
        { reason: 'Auto-refund: payment captured after cancellation', orderId },
        { idempotencyKey: `rfnd-cac-${orderId}` },
      );

      await tx.order.update({
        where: { id: orderId },
        data: { refundedAmount: { increment: payment.amount } },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          status: 'CANCELLED',
          note: `Payment captured after cancellation; auto-refund initiated: ${refund.id}, amount: ${payment.amount} paise`,
          source: 'WEBHOOK',
        },
      });
    },
    { timeout: RECOVERY_TX_TIMEOUT_MS },
  );

  deps.log.error(
    { orderId, paymentId: payment.id, amount: payment.amount },
    'ALERT payment captured after cancellation; auto-refund initiated',
  );
};

const handlePaymentCaptured = async (
  deps: WebhookHandlerDeps,
  event: RazorpayEvent,
): Promise<void> => {
  const payment = event.payload.payment?.entity;
  if (payment === undefined) {
    deps.log.warn({ eventId: event.id }, 'payment.captured: missing payment entity');
    return;
  }

  const order = await deps.prisma.order.findFirst({
    where: { razorpayOrderId: payment.order_id },
    select: { id: true, total: true },
  });

  if (order === null) {
    deps.log.warn({ razorpayOrderId: payment.order_id }, 'payment.captured: order not found');
    return;
  }

  // Never confirm on a mismatched amount — record the anomaly for manual handling instead.
  if (payment.amount !== order.total) {
    deps.log.error(
      { orderId: order.id, paymentId: payment.id, captured: payment.amount, expected: order.total },
      'ALERT payment.captured amount mismatch; order left unconfirmed',
    );
    await deps.prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: 'PENDING',
        note: `Payment amount mismatch: captured ${payment.amount} paise, expected ${order.total} paise (${payment.id})`,
        source: 'WEBHOOK',
      },
    });
    return;
  }

  try {
    await markPaid(deps.prisma, order.id, payment.id, { hooks: deps.hooks });
  } catch (err) {
    if (err instanceof AppError && err.code === 'CONFLICT') {
      await handleCaptureAfterCancel(deps, order.id, payment);
      return;
    }
    throw err;
  }
};

const handlePaymentFailed = async (
  deps: WebhookHandlerDeps,
  event: RazorpayEvent,
): Promise<void> => {
  const payment = event.payload.payment?.entity;
  if (payment === undefined) {
    deps.log.warn({ eventId: event.id }, 'payment.failed: missing payment entity');
    return;
  }

  const order = await deps.prisma.order.findFirst({
    where: { razorpayOrderId: payment.order_id },
    select: { id: true },
  });

  if (order === null) {
    deps.log.warn({ razorpayOrderId: payment.order_id }, 'payment.failed: order not found');
    return;
  }

  await deps.prisma.$transaction([
    deps.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'FAILED' },
    }),
    deps.prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: 'PENDING',
        note: `Payment failed: ${payment.id}`,
        source: 'WEBHOOK',
      },
    }),
  ]);
};

type RefundHandlerTx = Pick<PrismaTx, 'order' | 'orderStatusEvent'>;

const handleRefundProcessed = async (
  deps: WebhookHandlerDeps,
  event: RazorpayEvent,
): Promise<void> => {
  const refund = event.payload.refund?.entity;
  if (refund === undefined) {
    deps.log.warn({ eventId: event.id }, 'refund.processed: missing refund entity');
    return;
  }

  const order = await deps.prisma.order.findFirst({
    where: { razorpayPaymentId: refund.payment_id },
    select: { id: true, status: true, total: true },
  });

  if (order === null) {
    deps.log.warn({ paymentId: refund.payment_id }, 'refund.processed: order not found');
    return;
  }

  const isFullRefund = refund.amount >= order.total;
  const newPaymentStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await deps.prisma.$transaction(async (tx: RefundHandlerTx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: newPaymentStatus },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: `Refund processed: ${refund.id}, amount: ${refund.amount} paise`,
        source: 'WEBHOOK',
      },
    });
  });
};

export const handleRazorpayEvent = async (
  deps: WebhookHandlerDeps,
  event: RazorpayEvent,
): Promise<void> => {
  switch (event.event) {
    case 'payment.captured':
      await handlePaymentCaptured(deps, event);
      break;
    case 'payment.failed':
      await handlePaymentFailed(deps, event);
      break;
    case 'refund.processed':
      await handleRefundProcessed(deps, event);
      break;
    default:
      deps.log.info({ eventId: event.id, eventType: event.event }, 'unhandled Razorpay event');
  }
};
