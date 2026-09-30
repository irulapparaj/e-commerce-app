/**
 * Integration tests for order creation (POST /orders) — P12.
 * Covers: happy path, idempotency, price-change rejection, insufficient stock,
 * and missing Idempotency-Key.
 *
 * Razorpay and Jobs queue are mocked; everything else (routes, DB transaction,
 * stock deduction) runs against the real test database.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { applyMovement } from '../../../src/modules/inventory/apply-movement';
import type { TestApp, TestAppOptions } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { bearer, loginCustomer, resetValkey } from '../../helpers/auth';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';

// ---------------------------------------------------------------------------
// Local type stubs for P04 modules not yet present in this worktree's source.
// When the P04 code is committed, these can be replaced with proper imports:
//   import type { JobQueue } from '../../../src/jobs/queue';
//   import type { RazorpayClient } from '../../../src/modules/payments/razorpay.client';
// ---------------------------------------------------------------------------

interface RazorpayClient {
  createOrder: Mock;
  fetchPayment: Mock;
  createRefund: Mock;
}

interface JobQueue {
  send: (name: string, data: unknown, options?: { startAfter?: string; singletonKey?: string }) => Promise<string | null>;
  getJob: (name: string, id: string) => Promise<unknown>;
  work: (name: string, handler: (job: unknown) => Promise<unknown>) => Promise<void>;
  schedule: (name: string, cron: string, data: unknown) => Promise<void>;
  stop: () => Promise<void>;
}

// TestAppOptions already has razorpay and jobs fields.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const buildRazorpayMock = (): RazorpayClient => ({
  createOrder: vi.fn().mockImplementation((_amount: number) =>
    Promise.resolve({ id: `order_${randomUUID().slice(0, 10)}`, amount: _amount }),
  ),
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly razorpayOrderId: string;
  readonly amountPaise: number;
  readonly keyId: string;
}

const body = <T>(res: { body: string }): { data: T } =>
  JSON.parse(res.body) as { data: T };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('POST /orders — order creation', () => {
  let testApp: TestApp;
  let razorpayMock: ReturnType<typeof buildRazorpayMock>;
  let jobsMock: JobQueue;
  let accessToken: string;
  let userId: string;
  let addressId: string;
  let variantId: string;
  let variantPrice: number;

  beforeAll(async () => {
    razorpayMock = buildRazorpayMock();
    jobsMock = buildJobsMock();
    testApp = await buildTestApp({
      razorpay: razorpayMock,
      jobs: jobsMock,
    } as unknown as TestAppOptions);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    vi.clearAllMocks();

    // Seed minimal: categories, 2 products, settings, admin.
    const { categoryId } = await seedMinimal(getPrisma());
    const prisma = getPrisma();

    // Create a test product with a known price and stock directly via Prisma.
    variantPrice = 59900; // ₹599 in paise
    const product = await prisma.product.create({
      data: {
        name: 'Order Test Product',
        slug: `order-test-${randomUUID()}`,
        sku: `OTP-${Date.now()}`,
        categoryId,
        hsnCode: '33050000',
        gstRate: 18,
        isActive: true,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `OTP-V1-${Date.now()}`,
        label: 'Standard',
        price: variantPrice,
        weightGrams: 100,
        isDefault: true,
      },
    });
    variantId = variant.id;

    // Add stock (10 units) via the movement ledger.
    await prisma.$transaction((tx: Parameters<typeof applyMovement>[1]) =>
      applyMovement({ variantId, delta: 10, reason: 'IMPORT', note: 'test seed' }, tx),
    );

    // Log in as a new customer.
    const email = `order-customer-${randomUUID()}@example.test`;
    const session = await loginCustomer(testApp, email);
    accessToken = session.accessToken;
    userId = session.user.id;

    // Create a shipping address for this user.
    const address = await prisma.address.create({
      data: {
        userId,
        name: 'Test Buyer',
        phone: '+919876543210',
        line1: '12 Test Street',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
        isDefault: true,
      },
    });
    addressId = address.id;
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('creates an order, returns Razorpay order ID, and deducts stock', async () => {
    const idempotencyKey = randomUUID();

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...bearer(accessToken), 'idempotency-key': idempotencyKey },
      payload: {
        addressId,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 2 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const result = body<CreateOrderResult>(res).data;
    expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.razorpayOrderId).toBeTruthy();
    expect(result.amountPaise).toBeGreaterThan(0);

    // Verify the order exists in the DB with PENDING status.
    const order = await getPrisma().order.findUnique({ where: { id: result.orderId } });
    expect(order?.status).toBe('PENDING');
    expect(order?.paymentStatus).toBe('PENDING');
    expect(order?.razorpayOrderId).toBeTruthy();

    // Verify stock was decremented by 2.
    const variant = await getPrisma().productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stock).toBe(8); // started at 10, reserved 2

    // Verify the release job was enqueued.
    expect(jobsMock.send).toHaveBeenCalledWith(
      'order.release',
      { orderId: result.orderId },
      expect.objectContaining({ startAfter: '30 minutes' }),
    );
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  it('returns the cached result when the same Idempotency-Key is used twice', async () => {
    const idempotencyKey = randomUUID();
    const payload = {
      addressId,
      shippingMethod: 'standard',
      items: [{ variantId, quantity: 1 }],
    };
    const headers = { ...bearer(accessToken), 'idempotency-key': idempotencyKey };

    const first = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers,
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstResult = body<CreateOrderResult>(first).data;

    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers,
      payload,
    });

    // Second call must replay the first response without creating a new order.
    expect(second.statusCode).toBe(201);
    const secondResult = body<CreateOrderResult>(second).data;
    expect(secondResult.orderId).toBe(firstResult.orderId);
    expect(secondResult.razorpayOrderId).toBe(firstResult.razorpayOrderId);

    // Razorpay was only called once — no duplicate order creation.
    expect(razorpayMock.createOrder).toHaveBeenCalledTimes(1);

    // Stock was only deducted once.
    const variant = await getPrisma().productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stock).toBe(9); // 10 - 1
  });

  // -----------------------------------------------------------------------
  // Price changed between initiation and creation
  // -----------------------------------------------------------------------

  it('rejects with CONFLICT when price changes between pre-compute and DB transaction', async () => {
    // Hold a reference to the original createOrder mock so we can change the price mid-flight.
    let priceChanged = false;
    razorpayMock.createOrder.mockImplementationOnce(async (amount: number) => {
      // Change price in DB after Razorpay order is created (simulates a race).
      if (!priceChanged) {
        priceChanged = true;
        await getPrisma().productVariant.update({
          where: { id: variantId },
          data: { price: variantPrice + 10000 }, // price went up ₹100
        });
      }
      return { id: `order_${randomUUID().slice(0, 10)}`, amount };
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...bearer(accessToken), 'idempotency-key': randomUUID() },
      payload: {
        addressId,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 1 }],
      },
    });

    expect(res.statusCode).toBe(409); // AppError CONFLICT → HTTP 409
    const parsed = JSON.parse(res.body) as { error: { code: string; message: string } };
    expect(parsed.error.message).toContain('Prices changed');

    // Stock must not have been deducted on a rejected order.
    const variant = await getPrisma().productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stock).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Insufficient stock
  // -----------------------------------------------------------------------

  it('rejects with INSUFFICIENT_STOCK when requesting more than available', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...bearer(accessToken), 'idempotency-key': randomUUID() },
      payload: {
        addressId,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 99 }], // only 10 in stock
      },
    });

    expect(res.statusCode).toBe(409); // INSUFFICIENT_STOCK maps to 409 via AppError

    // Stock must be untouched.
    const variant = await getPrisma().productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stock).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Missing Idempotency-Key
  // -----------------------------------------------------------------------

  it('returns 400 when Idempotency-Key header is absent', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: bearer(accessToken),
      payload: {
        addressId,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 1 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // -----------------------------------------------------------------------
  // Missing address
  // -----------------------------------------------------------------------

  it('returns NOT_FOUND when address does not belong to user', async () => {
    const anotherUserId = (
      await getPrisma().user.create({
        data: { email: `other-${randomUUID()}@example.test`, phone: '+919000000001', role: 'CUSTOMER' },
      })
    ).id;
    const otherAddress = await getPrisma().address.create({
      data: {
        userId: anotherUserId,
        name: 'Someone Else',
        phone: '+919000000099',
        line1: '1 Other Lane',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
      },
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...bearer(accessToken), 'idempotency-key': randomUUID() },
      payload: {
        addressId: otherAddress.id,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 1 }],
      },
    });

    expect(res.statusCode).toBe(404);
  });

  // -----------------------------------------------------------------------
  // Unauthenticated
  // -----------------------------------------------------------------------

  it('returns 401 when no token is provided', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        addressId,
        shippingMethod: 'standard',
        items: [{ variantId, quantity: 1 }],
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
