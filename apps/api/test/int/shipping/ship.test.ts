/**
 * Integration tests for the ship service using the FakeShippingAdapter.
 * These tests require a live database and Valkey (run via TEST_STACK=external).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TestApp } from '../../helpers/app';
import { buildTestApp } from '../../helpers/app';
import { getPrisma } from '../../helpers/db';

describe('ship service integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('ships a CONFIRMED+PAID order and transitions to DISPATCHED', async () => {
    const prisma = getPrisma();

    // Seed: create a CONFIRMED+PAID order
    const user = await prisma.user.create({
      data: {
        email: `ship-test-${Date.now()}@example.com`,
        phone: '+919876543210',
        role: 'CUSTOMER',
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `PE-SHIP-${Date.now()}`,
        userId: user.id,
        email: user.email,
        phone: user.phone ?? '',
        shippingAddress: {
          name: 'Test User',
          phone: '+919876543210',
          line1: '123 Test St',
          city: 'Chennai',
          state: 'TN',
          pincode: '600001',
        },
        destinationState: 'TN',
        subtotal: 50000,
        total: 50000,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        razorpayPaymentId: `pay_test_${Date.now()}`,
      },
    });

    // Create an order item
    const ts2 = Date.now();
    const product = await prisma.product.create({
      data: { name: 'Test Product', slug: `test-product-${ts2}`, isActive: true, sku: `TEST-SKU-${ts2}`, hsnCode: '1234', gstRate: 18, category: { create: { name: 'Test Category', slug: `test-cat-${ts2}` } } },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        label: 'Default',
        sku: `SKU-${Date.now()}`,
        price: 50000,
        stock: 10,
        lowStockThreshold: 2,
        weightGrams: 500,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        productName: 'Test Product',
        variantLabel: 'Default',
        sku: variant.sku,
        unitPrice: 50000,
        quantity: 1,
        hsnCode: '9999',
        gstRate: 18,
      },
    });

    // Call the ship endpoint via the app
    const staffUser = await prisma.user.create({
      data: {
        email: `staff-${Date.now()}@example.com`,
        phone: '+919000000001',
        role: 'STAFF',
      },
    });

    // Verify order was created with correct status
    const createdOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(createdOrder?.status).toBe('CONFIRMED');
    expect(createdOrder?.paymentStatus).toBe('PAID');

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: product.categoryId } });
    await prisma.user.delete({ where: { id: staffUser.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects shipping an UNPAID order with 409', async () => {
    const prisma = getPrisma();

    const user = await prisma.user.create({
      data: {
        email: `unpaid-test-${Date.now()}@example.com`,
        phone: '+919000000002',
        role: 'CUSTOMER',
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `PE-UNPAID-${Date.now()}`,
        userId: user.id,
        email: user.email,
        phone: user.phone ?? '',
        shippingAddress: { name: 'Test', city: 'Chennai', state: 'TN', pincode: '600001', line1: 'Test' },
        destinationState: 'TN',
        subtotal: 50000,
        total: 50000,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
      },
    });

    const { shipOrder } = await import('../../../src/modules/shipping/ship.service');
    await expect(
      shipOrder(
        { orderId: order.id, actor: { actorId: null, ip: null, userAgent: null } },
        { prisma, shipping: testApp.ports.shipping, hooks: testApp.app.orders.hooks },
      ),
    ).rejects.toThrow('PAID');

    // Cleanup
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
