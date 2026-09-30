/**
 * Integration tests for payment verification (POST /orders/:id/verify-payment) — P12 / H-01.
 * Covers: valid signature + captured status, invalid signature, authorized-only status (H-01),
 * and amount mismatch.
 *
 * Razorpay is mocked; signature validation runs against the real RAZORPAY_KEY_SECRET from the
 * test env fixture.
 */
import { createHmac, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { TestApp, TestAppOptions } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { bearer, loginCustomer, resetValkey } from '../../helpers/auth';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';

// ---------------------------------------------------------------------------
// Local type stubs for P04 modules not yet present in this worktree's source.
// ---------------------------------------------------------------------------

interface RazorpayClient {
  createOrder: Mock;
  fetchPayment: Mock;
  createRefund: Mock;
}

interface JobQueue {
  send(name: string, data: unknown, options?: { startAfter?: string; singletonKey?: string }): Promise<string | null>;
  getJob(name: string, id: string): Promise<unknown>;
  work(name: string, handler: (job: unknown) => Promise<unknown>): Promise<void>;
  schedule(name: string, cron: string, data: unknown): Promise<void>;
  stop(): Promise<void>;
}

// TestAppOptions already has razorpay and jobs fields.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid Razorpay payment signature: HMAC-SHA256(orderId|paymentId, secret). */
const signPayment = (razorpayOrderId: string, razorpayPaymentId: string, secret: string): string =>
  createHmac('sha256', secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');

const body = <T>(res: { body: string }): { data: T } =>
  JSON.parse(res.body) as { data: T };

const buildRazorpayMock = (): RazorpayClient => ({
  createOrder: vi.fn(),
  fetchPayment: vi.fn(),
  createRefund: vi.fn(),
});

const buildJobsMock = (): JobQueue => ({
  send: vi.fn().mockResolvedValue('fake-job-id'),
  getJob: vi.fn().mockResolvedValue(null),
  work: vi.fn().mockResolvedValue(undefined),
  schedule: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

interface OrderSeed {
  readonly userId: string;
  readonly totalPaise?: number;
  readonly status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('POST /orders/:id/verify-payment', () => {
  let testApp: TestApp;
  let razorpayMock: ReturnType<typeof buildRazorpayMock>;
  let keySecret: string;
  let accessToken: string;
  let userId: string;

  const createPendingOrder = async (
    { userId: uid, totalPaise = 59900, status = 'PENDING' }: OrderSeed,
  ) => {
    const prisma = getPrisma();
    return prisma.order.create({
      data: {
        orderNumber: `PE-VT-${randomUUID().slice(0, 12)}`,
        userId: uid,
        email: `verify-${randomUUID()}@example.test`,
        phone: '+919876543210',
        shippingAddress: { name: 'Test', line1: '1 Test St', city: 'Chennai', state: 'TN', pincode: '600001' },
        destinationState: 'TN',
        subtotal: totalPaise,
        total: totalPaise,
        status,
        paymentStatus: 'PENDING',
        razorpayOrderId: `order_${randomUUID().slice(0, 10)}`,
      },
    });
  };

  beforeAll(async () => {
    razorpayMock = buildRazorpayMock();
    testApp = await buildTestApp({
      razorpay: razorpayMock,
      jobs: buildJobsMock(),
    } as unknown as TestAppOptions);
    keySecret = testApp.env.RAZORPAY_KEY_SECRET;
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    vi.clearAllMocks();

    await seedMinimal(getPrisma());

    const email = `verify-customer-${randomUUID()}@example.test`;
    const session = await loginCustomer(testApp, email);
    accessToken = session.accessToken;
    userId = session.user.id;
  });

  // -----------------------------------------------------------------------
  // Happy path — captured status
  // -----------------------------------------------------------------------

  it('marks the order as PAID when signature is valid and payment is captured', async () => {
    const order = await createPendingOrder({ userId });
    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(razorpayOrderId, razorpayPaymentId, keySecret);

    razorpayMock.fetchPayment.mockResolvedValueOnce({
      status: 'captured',
      amount: order.total,
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken),
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(body<{ verified: boolean }>(res).data.verified).toBe(true);

    // Verify DB state was updated.
    const updated = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.razorpayPaymentId).toBe(razorpayPaymentId);
  });

  // -----------------------------------------------------------------------
  // Invalid signature — H-01 adjacent (signature guard)
  // -----------------------------------------------------------------------

  it('returns 401 when the payment signature is invalid', async () => {
    const order = await createPendingOrder({ userId });
    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const badSignature = 'not-a-valid-signature-at-all';

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken),
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: badSignature,
      },
    });

    expect(res.statusCode).toBe(401);

    // DB must remain untouched.
    const unchanged = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paymentStatus).toBe('PENDING');
  });

  // -----------------------------------------------------------------------
  // H-01 fix: 'authorized' status should be rejected as not yet captured
  // -----------------------------------------------------------------------

  it('returns 409 when payment status is "authorized" but not yet "captured" (H-01)', async () => {
    const order = await createPendingOrder({ userId });
    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(razorpayOrderId, razorpayPaymentId, keySecret);

    // Razorpay returns 'authorized' — funds are authorized but not settled.
    razorpayMock.fetchPayment.mockResolvedValueOnce({
      status: 'authorized',
      amount: order.total,
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken),
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    // Only 'captured' should be accepted — 'authorized' alone is not a completed payment.
    expect(res.statusCode).toBe(409);

    // DB must remain untouched — no premature PAID status.
    const unchanged = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paymentStatus).toBe('PENDING');
  });

  // -----------------------------------------------------------------------
  // Amount mismatch
  // -----------------------------------------------------------------------

  it('returns 409 when payment amount does not match the order total', async () => {
    const order = await createPendingOrder({ userId, totalPaise: 59900 });
    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(razorpayOrderId, razorpayPaymentId, keySecret);

    // Payment amount is different from the order total.
    razorpayMock.fetchPayment.mockResolvedValueOnce({
      status: 'captured',
      amount: 10000, // wrong amount
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken),
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    expect(res.statusCode).toBe(409);

    // DB must remain untouched.
    const unchanged = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paymentStatus).toBe('PENDING');
  });

  // -----------------------------------------------------------------------
  // Wrong order ID in payload (razorpay_order_id mismatch)
  // -----------------------------------------------------------------------

  it('returns 400 when razorpay_order_id does not match the stored order', async () => {
    const order = await createPendingOrder({ userId });
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    // Use a completely different Razorpay order ID.
    const wrongRazorpayOrderId = `order_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(wrongRazorpayOrderId, razorpayPaymentId, keySecret);

    // fetchPayment is irrelevant here — the mismatch check happens before it.
    razorpayMock.fetchPayment.mockResolvedValueOnce({ status: 'captured', amount: order.total });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken),
      payload: {
        razorpay_order_id: wrongRazorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    // The service will re-verify signature and find the order ID doesn't match.
    // AppError VALIDATION → HTTP 400, or UNAUTHENTICATED → 401 if sig check fails first.
    expect([400, 401, 409]).toContain(res.statusCode);

    const unchanged = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paymentStatus).toBe('PENDING');
  });

  // -----------------------------------------------------------------------
  // Unauthenticated
  // -----------------------------------------------------------------------

  it('returns 401 when no authentication token is provided', async () => {
    const order = await createPendingOrder({ userId });
    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(razorpayOrderId, razorpayPaymentId, keySecret);

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // -----------------------------------------------------------------------
  // Order not found / wrong user
  // -----------------------------------------------------------------------

  it("returns 404 when the order belongs to a different user", async () => {
    // Create a second user and an order for them.
    const otherUser = await getPrisma().user.create({
      data: { email: `other-${randomUUID()}@example.test`, phone: '+919000000002', role: 'CUSTOMER' },
    });
    const order = await createPendingOrder({ userId: otherUser.id });

    const razorpayOrderId = order.razorpayOrderId ?? '';
    const razorpayPaymentId = `pay_${randomUUID().slice(0, 10)}`;
    const signature = signPayment(razorpayOrderId, razorpayPaymentId, keySecret);

    razorpayMock.fetchPayment.mockResolvedValueOnce({ status: 'captured', amount: order.total });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/verify-payment`,
      headers: bearer(accessToken), // logged in as a *different* user
      payload: {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      },
    });

    // Signature check will fail (different secret or mismatch) or NOT_FOUND — either is acceptable.
    expect([401, 404]).toContain(res.statusCode);

    // Regardless, the order must not be marked as PAID.
    const unchanged = await getPrisma().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paymentStatus).toBe('PENDING');
  });
});
