/**
 * Integration tests for durable Razorpay webhook processing (review fixes C-1 and C-4).
 * Requires a live database (run via TEST_STACK=external). Razorpay's API is mocked;
 * everything else (routes, HMAC, DB accounting) is real.
 */
import { createHmac, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RazorpayClient } from '../../../src/modules/payments/razorpay.client';
import { runWebhookReconcile } from '../../../src/modules/payments/webhook.reconcile.job';
import type { TestApp } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { getPrisma } from '../../helpers/db';

const buildRazorpayMock = () => ({
  createOrder: vi.fn(),
  fetchPayment: vi.fn(),
  createRefund: vi.fn().mockImplementation((_paymentId: string, amount: number) =>
    Promise.resolve({ id: `rfnd_${randomUUID().slice(0, 8)}`, payment_id: 'pay', amount, status: 'processed' }),
  ),
});
type RazorpayMock = ReturnType<typeof buildRazorpayMock>;

interface OrderSeed {
  readonly status?: 'PENDING' | 'CANCELLED';
  readonly totalPaise?: number;
}

const createOrder = async ({ status = 'PENDING', totalPaise = 59900 }: OrderSeed = {}) => {
  const prisma = getPrisma();
  const user = await prisma.user.create({
    data: { email: `wh-${randomUUID()}@example.com`, phone: '+919000000030', role: 'CUSTOMER' },
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `PE-WH-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      email: user.email,
      phone: user.phone ?? '',
      shippingAddress: { name: 'Test', city: 'Chennai', state: 'TN', pincode: '600001', line1: 'Test' },
      destinationState: 'TN',
      subtotal: totalPaise,
      total: totalPaise,
      status,
      paymentStatus: 'PENDING',
      razorpayOrderId: `order_${randomUUID().slice(0, 10)}`,
    },
  });
  return order;
};

const captureEvent = (razorpayOrderId: string, amount: number) => ({
  id: `evt_${randomUUID().slice(0, 12)}`,
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: `pay_${randomUUID().slice(0, 10)}`,
        order_id: razorpayOrderId,
        status: 'captured',
        amount,
        email: 'pii-leak@example.com',
        contact: '+919812345678',
      },
    },
  },
});

describe('Razorpay webhook durability', () => {
  let testApp: TestApp;
  let razorpayMock: RazorpayMock;

  const post = (event: object) => {
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', testApp.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
    return testApp.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
      payload: body,
    });
  };

  beforeAll(async () => {
    razorpayMock = buildRazorpayMock();
    testApp = await buildTestApp({ razorpay: razorpayMock as unknown as RazorpayClient });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    razorpayMock.createRefund.mockClear();
  });

  it('confirms the order and stamps processedAt on capture', async () => {
    const order = await createOrder();
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);

    const res = await post(event);
    expect(res.statusCode).toBe(200);

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.razorpayPaymentId).toBe(event.payload.payment.entity.id);

    const row = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
    });
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toBeNull();
  });

  it('answers a replay of a processed event without reprocessing', async () => {
    const order = await createOrder();
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);

    await post(event);
    const replay = await post(event);

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ received: true, replayed: true });
  });

  it('stores the payload with PII scrubbed (C-4)', async () => {
    const order = await createOrder();
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);

    await post(event);

    const row = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
    });
    const stored = JSON.stringify(row.payload);
    expect(stored).not.toContain('pii-leak@example.com');
    expect(stored).not.toContain('+919812345678');
    expect(stored).toContain(order.razorpayOrderId ?? '');
  });

  it('leaves the order unconfirmed and records the anomaly on an amount mismatch', async () => {
    const order = await createOrder({ totalPaise: 59900 });
    const event = captureEvent(order.razorpayOrderId ?? '', 10000);

    const res = await post(event);
    expect(res.statusCode).toBe(200);

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('PENDING');
    expect(updated.paymentStatus).toBe('PENDING');

    const anomaly = await getPrisma().orderStatusEvent.findFirst({
      where: { orderId: order.id, note: { contains: 'amount mismatch' } },
    });
    expect(anomaly).not.toBeNull();
  });

  it('persists the payment id and auto-initiates a refund when capture lands after cancellation (C-1)', async () => {
    const order = await createOrder({ status: 'CANCELLED' });
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);
    const paymentId = event.payload.payment.entity.id;

    const res = await post(event);
    expect(res.statusCode).toBe(200);

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('CANCELLED');
    // The refund endpoint used to refuse forever because this stayed NULL
    expect(updated.razorpayPaymentId).toBe(paymentId);
    expect(updated.refundedAmount).toBe(order.total);
    expect(razorpayMock.createRefund).toHaveBeenCalledWith(
      paymentId,
      order.total,
      expect.any(Object),
      { idempotencyKey: `rfnd-cac-${order.id}` },
    );

    // A replay never pays out twice
    const replay = await post(event);
    expect(replay.statusCode).toBe(200);
    expect(razorpayMock.createRefund).toHaveBeenCalledTimes(1);
  });

  it('returns 500 on a transient failure and succeeds when the provider retries (C-1)', async () => {
    const order = await createOrder({ status: 'CANCELLED' });
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);

    razorpayMock.createRefund.mockRejectedValueOnce(new Error('razorpay unreachable'));

    const first = await post(event);
    expect(first.statusCode).toBe(500);

    const row = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
    });
    expect(row.processedAt).toBeNull();
    expect(row.error).toContain('razorpay unreachable');

    // Razorpay retries on non-2xx; the dedupe row no longer swallows the retry
    const retry = await post(event);
    expect(retry.statusCode).toBe(200);

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.refundedAmount).toBe(order.total);
    const reprocessed = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
    });
    expect(reprocessed.processedAt).not.toBeNull();
    expect(reprocessed.error).toBeNull();
  });

  it('reconcile sweep replays events stranded past the retry window (C-1)', async () => {
    const order = await createOrder();
    const event = captureEvent(order.razorpayOrderId ?? '', order.total);

    await getPrisma().webhookEvent.create({
      data: {
        provider: 'RAZORPAY',
        externalId: event.id,
        signatureValid: true,
        payload: event,
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    });

    const result = await runWebhookReconcile(
      {
        prisma: getPrisma(),
        hooks: testApp.app.orders.hooks,
        log: testApp.app.log,
        razorpay: razorpayMock,
      },
      { trigger: 'manual' },
    );

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('CONFIRMED');
    const row = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
    });
    expect(row.processedAt).not.toBeNull();
  });
});
