/**
 * Integration tests for the refund service (review fix C-2).
 * These tests require a live database (run via TEST_STACK=external).
 * Razorpay calls are mocked; accounting runs against the real DB under FOR UPDATE.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { refundIdempotencyKey, refundOrder } from '../../../src/modules/admin/orders/refund.service';
import type { RazorpayClient } from '../../../src/modules/payments/razorpay.client';
import type { TestApp } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { getPrisma } from '../../helpers/db';

const buildRazorpayMock = () => ({
  createOrder: vi.fn(),
  fetchPayment: vi.fn(),
  createRefund: vi.fn().mockImplementation((_paymentId: string, amount: number) =>
    Promise.resolve({
      id: `rfnd_${randomUUID().slice(0, 8)}`,
      payment_id: 'pay_test',
      amount,
      status: 'processed',
    }),
  ),
});

type RazorpayMock = ReturnType<typeof buildRazorpayMock>;
const asClient = (mock: RazorpayMock): RazorpayClient => mock;

const actor = { actorId: null, ip: null, userAgent: null };

const createPaidOrder = async (totalPaise: number, paymentId: string | null = `pay_${randomUUID().slice(0, 10)}`) => {
  const prisma = getPrisma();
  const user = await prisma.user.create({
    data: { email: `refund-${randomUUID()}@example.com`, phone: '+919000000020', role: 'CUSTOMER' },
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `PE-RF-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      email: user.email,
      phone: user.phone ?? '',
      shippingAddress: { name: 'Test', city: 'Chennai', state: 'TN', pincode: '600001', line1: 'Test' },
      destinationState: 'TN',
      subtotal: totalPaise,
      total: totalPaise,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      razorpayPaymentId: paymentId,
    },
  });
  return {
    order,
    cleanup: async () => {
      await prisma.orderStatusEvent.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: user.id } });
    },
  };
};

describe('refundOrder service integration', () => {
  let testApp: TestApp;
  let razorpayMock: RazorpayMock;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    razorpayMock = buildRazorpayMock();
  });

  it('initiates a refund, records refundedAmount, and sends an idempotency key', async () => {
    const { order, cleanup } = await createPaidOrder(10000);

    const result = await refundOrder(
      { orderId: order.id, amountPaise: 5000, reason: 'Customer requested partial refund', actor },
      { prisma: getPrisma(), razorpay: asClient(razorpayMock) },
    );

    expect(result.status).toBe('INITIATED');
    expect(razorpayMock.createRefund).toHaveBeenCalledWith(
      order.razorpayPaymentId,
      5000,
      expect.any(Object),
      { idempotencyKey: refundIdempotencyKey(order.id, 0) },
    );

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.refundedAmount).toBe(5000);

    await cleanup();
  });

  it('caps successive refunds by refundedAmount, not note strings (C-2)', async () => {
    const { order, cleanup } = await createPaidOrder(10000);
    const deps = { prisma: getPrisma(), razorpay: asClient(razorpayMock) };

    // Note-format drift used to zero the old regex-based guard; it must be irrelevant now.
    await getPrisma().orderStatusEvent.create({
      data: { orderId: order.id, status: 'CONFIRMED', note: 'Refund initiated: garbled note', source: 'ADMIN' },
    });

    await refundOrder({ orderId: order.id, amountPaise: 6000, reason: 'First partial refund', actor }, deps);
    // Second refund carries the next sequence in its idempotency key
    await refundOrder({ orderId: order.id, amountPaise: 4000, reason: 'Second partial refund', actor }, deps);
    expect(razorpayMock.createRefund).toHaveBeenLastCalledWith(
      order.razorpayPaymentId,
      4000,
      expect.any(Object),
      { idempotencyKey: refundIdempotencyKey(order.id, 6000) },
    );

    await expect(
      refundOrder({ orderId: order.id, amountPaise: 1, reason: 'One paisa too many', actor }, deps),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_CAPTURED' });

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.refundedAmount).toBe(10000);
    expect(razorpayMock.createRefund).toHaveBeenCalledTimes(2);

    await cleanup();
  });

  it('serializes concurrent submissions: exactly one of two racing refunds succeeds (C-2)', async () => {
    const { order, cleanup } = await createPaidOrder(10000);
    const deps = { prisma: getPrisma(), razorpay: asClient(razorpayMock) };

    const attempt = () =>
      refundOrder({ orderId: order.id, amountPaise: 8000, reason: 'Concurrent double-click refund', actor }, deps)
        .then(() => 'fulfilled' as const)
        .catch(() => 'rejected' as const);

    const outcomes = await Promise.all([attempt(), attempt()]);

    expect(outcomes.filter((o) => o === 'fulfilled')).toHaveLength(1);
    expect(razorpayMock.createRefund).toHaveBeenCalledTimes(1);
    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.refundedAmount).toBe(8000);

    await cleanup();
  });

  it('reuses the same idempotency key when retrying after an ambiguous failure', async () => {
    const { order, cleanup } = await createPaidOrder(10000);
    const deps = { prisma: getPrisma(), razorpay: asClient(razorpayMock) };

    razorpayMock.createRefund.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(
      refundOrder({ orderId: order.id, amountPaise: 7000, reason: 'Refund that times out', actor }, deps),
    ).rejects.toThrow('socket hang up');

    // Nothing was recorded, so the retry recomputes the same sequence → same key → Razorpay replays.
    const afterFailure = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterFailure.refundedAmount).toBe(0);

    await refundOrder({ orderId: order.id, amountPaise: 7000, reason: 'Refund that times out', actor }, deps);
    const keys = razorpayMock.createRefund.mock.calls.map((call) => (call[3] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([refundIdempotencyKey(order.id, 0), refundIdempotencyKey(order.id, 0)]);

    await cleanup();
  });

  it('rejects refund when no payment was captured', async () => {
    const { order, cleanup } = await createPaidOrder(10000, null);
    await expect(
      refundOrder(
        { orderId: order.id, amountPaise: 5000, reason: 'No payment captured yet', actor },
        { prisma: getPrisma(), razorpay: asClient(razorpayMock) },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await cleanup();
  });

  it('rejects refund exceeding captured amount', async () => {
    const { order, cleanup } = await createPaidOrder(10000);
    await expect(
      refundOrder(
        { orderId: order.id, amountPaise: 20000, reason: 'Test excess refund request here', actor },
        { prisma: getPrisma(), razorpay: asClient(razorpayMock) },
      ),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_CAPTURED' });
    await cleanup();
  });

  it('rejects refund with reason shorter than 10 chars', async () => {
    const { order, cleanup } = await createPaidOrder(10000);
    await expect(
      refundOrder(
        { orderId: order.id, amountPaise: 5000, reason: 'Short', actor },
        { prisma: getPrisma(), razorpay: asClient(razorpayMock) },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await cleanup();
  });
});
