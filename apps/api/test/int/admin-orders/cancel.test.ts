/**
 * Integration tests for the cancel order service.
 * These tests require a live database (run via TEST_STACK=external).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cancelOrder } from '../../../src/modules/admin/orders/cancel.service';
import { createOrderHooks } from '../../../src/modules/orders/hooks';
import type { TestApp } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { getPrisma } from '../../helpers/db';

describe('cancelOrder service integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  const actor = { actorId: null, ip: null, userAgent: null };

  it('cancels a CONFIRMED order and releases stock', async () => {
    const prisma = getPrisma();
    const hooks = createOrderHooks();
    let cancelledEvent: { orderId: string } | null = null;
    hooks.onOrderCancelled((e) => { cancelledEvent = e; });

    const user = await prisma.user.create({
      data: { email: `cancel-test-${Date.now()}@example.com`, phone: '+919000000010', role: 'CUSTOMER' },
    });

    const ts = Date.now();
    const product = await prisma.product.create({
      data: { name: 'Cancel Test Product', slug: `cancel-product-${ts}`, isActive: true, sku: `TEST-SKU-${ts}`, hsnCode: '1234', gstRate: 18, category: { create: { name: 'Test Category', slug: `test-cat-${ts}` } } },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        label: 'Default',
        sku: `CANCEL-${Date.now()}`,
        price: 10000,
        stock: 5,
        lowStockThreshold: 1,
        weightGrams: 500,
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `PE-CANCEL-${Date.now()}`,
        userId: user.id,
        email: user.email,
        phone: user.phone ?? '',
        shippingAddress: { name: 'Test', city: 'Chennai', state: 'TN', pincode: '600001', line1: 'Test' },
        destinationState: 'TN',
        subtotal: 10000,
        total: 10000,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        productName: 'Cancel Test Product',
        variantLabel: 'Default',
        sku: variant.sku,
        unitPrice: 10000,
        quantity: 2,
        hsnCode: '9999',
        gstRate: 18,
      },
    });

    // Reduce stock by 2 to simulate ORDER_RESERVE
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: 3 },
    });

    await cancelOrder({ orderId: order.id, note: 'Test cancellation', actor }, { prisma, hooks });

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('CANCELLED');

    const stockAfter = await prisma.productVariant.findUnique({ where: { id: variant.id } });
    expect(stockAfter?.stock).toBe(5); // 3 + 2 released

    expect(cancelledEvent).not.toBeNull();

    // Cleanup. The append-only stock_movement ledger references the variant, so the
    // variant/product/category rows must stay; other suites truncate via resetDb.
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('rejects cancelling a DISPATCHED order with 409', async () => {
    const prisma = getPrisma();
    const hooks = createOrderHooks();

    const user = await prisma.user.create({
      data: { email: `cancel-dispatched-${Date.now()}@example.com`, phone: '+919000000011', role: 'CUSTOMER' },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `PE-DISPATCHED-${Date.now()}`,
        userId: user.id,
        email: user.email,
        phone: user.phone ?? '',
        shippingAddress: { name: 'Test', city: 'Chennai', state: 'TN', pincode: '600001', line1: 'Test' },
        destinationState: 'TN',
        subtotal: 10000,
        total: 10000,
        status: 'DISPATCHED',
        paymentStatus: 'PAID',
      },
    });

    await expect(
      cancelOrder({ orderId: order.id, actor }, { prisma, hooks }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
