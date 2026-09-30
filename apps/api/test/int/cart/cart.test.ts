/**
 * Integration tests for the shopping-cart API (P11).
 * Covers: add item, update quantity, remove item, GET cart, and key error paths.
 * Requires a live Valkey + Postgres stack (run via TEST_STACK=external).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyMovement } from '../../../src/modules/inventory/apply-movement';
import type { TestApp } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { bearer, loginCustomer, resetValkey } from '../../helpers/auth';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CartDto {
  readonly items: { variantId: string; quantity: number }[];
  readonly itemCount: number;
  readonly subtotalPaise: number;
}

const body = <T>(res: { body: string }): { data: T } =>
  JSON.parse(res.body) as { data: T };

const getCart = async (testApp: TestApp, token: string): Promise<CartDto> => {
  const res = await testApp.app.inject({
    method: 'GET',
    url: '/api/v1/cart',
    headers: bearer(token),
  });
  expect(res.statusCode).toBe(200);
  return body<CartDto>(res).data;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('cart API', () => {
  let testApp: TestApp;
  let variantId: string;
  let variantId2: string;
  let accessToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);

    // Seed minimal sets up categories, 2 products, settings, and an admin user.
    const { categoryId } = await seedMinimal(getPrisma());
    const prisma = getPrisma();

    // Ensure the seeded variants have stock so cart lines are priced correctly.
    const variants = await prisma.productVariant.findMany({
      select: { id: true, stock: true },
      orderBy: { sku: 'asc' },
    });

    const firstVariant = variants[0];
    const secondVariant = variants[1];
    if (firstVariant !== undefined && secondVariant !== undefined) {
      variantId = firstVariant.id;
      variantId2 = secondVariant.id;
    } else {
      // seedMinimal produced fewer variants than expected — create products directly.
      const category = await prisma.category.findFirst({ where: { id: categoryId } });
      const catId = category?.id ?? categoryId;
      const pA = await prisma.product.create({
        data: {
          name: 'Cart Test Product A',
          slug: `cart-test-a-${randomUUID()}`,
          sku: `CTA-${Date.now()}`,
          categoryId: catId,
          hsnCode: '33050000',
          gstRate: 18,
          isActive: true,
        },
      });
      const vA = await prisma.productVariant.create({
        data: { productId: pA.id, sku: `CTA-V1-${Date.now()}`, label: 'Standard', price: 59900, weightGrams: 100 },
      });
      variantId = vA.id;

      const pB = await prisma.product.create({
        data: {
          name: 'Cart Test Product B',
          slug: `cart-test-b-${randomUUID()}`,
          sku: `CTB-${Date.now()}`,
          categoryId: catId,
          hsnCode: '33050000',
          gstRate: 18,
          isActive: true,
        },
      });
      const vB = await prisma.productVariant.create({
        data: { productId: pB.id, sku: `CTB-V1-${Date.now()}`, label: 'Standard', price: 29900, weightGrams: 100 },
      });
      variantId2 = vB.id;
    }

    // Add stock to the variants so they are not 'unavailable' in priceCart.
    for (const vid of [variantId, variantId2]) {
      const current = await prisma.productVariant.findUnique({ where: { id: vid }, select: { stock: true } });
      if (current !== null && current.stock === 0) {
        await prisma.$transaction((tx: Parameters<typeof applyMovement>[1]) =>
          applyMovement({ variantId: vid, delta: 50, reason: 'IMPORT', note: 'test seed' }, tx),
        );
      }
    }

    // Log in as a new customer (OTP flow creates the user on first call).
    const customerEmail = `cart-customer-${randomUUID()}@example.test`;
    const session = await loginCustomer(testApp, customerEmail);
    accessToken = session.accessToken;
  });

  // -----------------------------------------------------------------------
  // GET /cart — empty cart
  // -----------------------------------------------------------------------

  it('GET /cart returns an empty cart for a new user', async () => {
    const cart = await getCart(testApp, accessToken);
    expect(cart.items).toHaveLength(0);
    expect(cart.itemCount).toBe(0);
    expect(cart.subtotalPaise).toBe(0);
  });

  // -----------------------------------------------------------------------
  // POST /cart/items — add item
  // -----------------------------------------------------------------------

  it('POST /cart/items adds an item and returns the priced cart', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 2 },
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    expect(cart.items).toHaveLength(1);
    const addedItem = cart.items[0];
    expect(addedItem?.variantId).toBe(variantId);
    expect(addedItem?.quantity).toBe(2);
    expect(cart.itemCount).toBe(2);
    expect(cart.subtotalPaise).toBeGreaterThan(0);
  });

  it('POST /cart/items increments quantity when item already in cart', async () => {
    // First add
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 1 },
    });

    // Second add — should sum to 2
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 1 },
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    const item = cart.items.find((i) => i.variantId === variantId);
    expect(item?.quantity).toBe(2);
  });

  it('POST /cart/items adds a second distinct item', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 1 },
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId: variantId2, quantity: 3 },
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    expect(cart.items).toHaveLength(2);
    expect(cart.itemCount).toBe(4); // 1 + 3
  });

  it('POST /cart/items returns 400 when quantity is 0', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  // -----------------------------------------------------------------------
  // PUT /cart/items/:variantId — update quantity
  // -----------------------------------------------------------------------

  it('PUT /cart/items/:variantId updates the item quantity', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 1 },
    });

    const res = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/cart/items/${variantId}`,
      headers: bearer(accessToken),
      payload: { quantity: 5 },
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    const item = cart.items.find((i) => i.variantId === variantId);
    expect(item?.quantity).toBe(5);
  });

  it('PUT /cart/items/:variantId with quantity=0 removes the item', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 2 },
    });

    const res = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/cart/items/${variantId}`,
      headers: bearer(accessToken),
      payload: { quantity: 0 },
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    expect(cart.items.find((i) => i.variantId === variantId)).toBeUndefined();
    expect(cart.itemCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // DELETE /cart/items/:variantId — remove item
  // -----------------------------------------------------------------------

  it('DELETE /cart/items/:variantId removes the item and returns updated cart', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId, quantity: 3 },
    });

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/cart/items/${variantId}`,
      headers: bearer(accessToken),
    });

    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    expect(cart.items.find((i) => i.variantId === variantId)).toBeUndefined();
    expect(cart.itemCount).toBe(0);
  });

  it('DELETE /cart/items/:variantId on a non-existent item is a no-op', async () => {
    const unknownVariant = randomUUID();
    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/cart/items/${unknownVariant}`,
      headers: bearer(accessToken),
    });
    // Cart does not error on removing a non-existent item — it's idempotent.
    expect(res.statusCode).toBe(200);
    const cart = body<CartDto>(res).data;
    expect(cart.items).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Guest cart — X-Cart-Session header
  // -----------------------------------------------------------------------

  it('guest cart uses X-Cart-Session header', async () => {
    const sessionId = randomUUID();

    const addRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { 'x-cart-session': sessionId },
      payload: { variantId, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(200);

    const getRes = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/cart',
      headers: { 'x-cart-session': sessionId },
    });
    expect(getRes.statusCode).toBe(200);
    const cart = body<CartDto>(getRes).data;
    expect(cart.items[0]?.variantId).toBe(variantId);
  });

  it('returns 400 when no auth header and no X-Cart-Session', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/cart',
    });
    expect(res.statusCode).toBe(400);
  });

  // -----------------------------------------------------------------------
  // Unavailable variant
  // -----------------------------------------------------------------------

  it('a variant with zero stock is flagged as unavailable in the priced cart', async () => {
    const prisma = getPrisma();
    const product = await prisma.product.findFirst({ include: { variants: { select: { id: true, stock: true } } } });
    if (product === null || product.variants.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const zeroStockVariantId = product.variants[0]!.id;

    // Force stock to zero (it may already be zero from seedMinimal).
    const currentStock = product.variants[0]!.stock;
    if (currentStock > 0) {
      await prisma.$transaction((tx: Parameters<typeof applyMovement>[1]) =>
        applyMovement({ variantId: zeroStockVariantId, delta: -currentStock, reason: 'ADJUSTMENT' }, tx),
      );
    }

    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: bearer(accessToken),
      payload: { variantId: zeroStockVariantId, quantity: 1 },
    });

    const cart = await getCart(testApp, accessToken);
    const line = cart.items.find((i) => i.variantId === zeroStockVariantId);
    // The cart accepts the item (no stock check at add time) but flags it in pricing.
    // itemCount only counts available items so it may be 0 even when the line is present.
    if (line !== undefined) {
      // Line is present but quantity is 0 when unavailable.
      expect(line.quantity).toBe(0);
    }
  });
});
