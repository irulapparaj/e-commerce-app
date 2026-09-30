import { AppError } from '@pe/shared';
import type Redis from 'ioredis';

import type { PrismaDb } from '../../db/prisma';
import type { OrderHooks } from '../orders/hooks';
import { markPaid } from '../orders/status';

import type { RazorpayClient } from './razorpay.client';
import { verifyPaymentSignature } from './signature';

export interface VerifyAndCaptureDeps {
  readonly razorpay: RazorpayClient;
  readonly hooks: OrderHooks;
}

export const verifyAndCapture = async (
  prisma: PrismaDb,
  _valkey: Redis,
  orderId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  userId: string,
  secret: string,
  deps: VerifyAndCaptureDeps,
): Promise<void> => {
  // 1. Verify signature
  const valid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature, secret);
  if (!valid) {
    throw new AppError('UNAUTHENTICATED', 'Payment signature is invalid', { httpStatus: 401 });
  }

  // 2. Load order and assert ownership and razorpayOrderId match
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, razorpayOrderId: true, total: true, paymentStatus: true },
  });
  if (order === null) throw new AppError('NOT_FOUND');

  if (order.razorpayOrderId !== razorpayOrderId) {
    throw new AppError('VALIDATION', 'Razorpay order ID does not match');
  }

  // 3. Fetch payment from Razorpay: verify status and amount
  const payment = await deps.razorpay.fetchPayment(razorpayPaymentId);
  // H-01: only `captured` is acceptable; `authorized` may expire before manual capture
  if (payment.status !== 'captured') {
    throw new AppError('CONFLICT', `Payment status is ${payment.status}, expected captured`);
  }
  if (payment.amount !== order.total) {
    throw new AppError('CONFLICT', 'Payment amount does not match order total');
  }

  // 4. Mark paid (idempotent)
  await markPaid(prisma, orderId, razorpayPaymentId, { hooks: deps.hooks });
};
