import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

import { getPrisma, getPrismaRaw, resetDb, seedMinimal } from '../../helpers/db';

const orderBase = (
  userId: string,
  overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
): Prisma.OrderUncheckedCreateInput => ({
  orderNumber: `PE-2026${String(Math.floor(Math.random() * 9000) + 1000)}`,
  userId,
  email: 'c@example.test',
  phone: '9876543210',
  shippingAddress: { line1: 'x', city: 'Chennai', state: 'TN', pincode: '600001' },
  destinationState: 'TN',
  subtotal: 8000,
  cgstAmount: 191,
  sgstAmount: 190,
  igstAmount: 0,
  total: 8000,
  ...overrides,
});

describe('database constraints', () => {
  let adminId: string;
  let variantId: string;

  beforeEach(async () => {
    await resetDb();
    const seeded = await seedMinimal(getPrisma());
    adminId = seeded.adminId;
    variantId = seeded.variantIds[0] ?? '';
  });

  describe('unique constraints', () => {
    it('rejects duplicate email, product sku, variant sku, slug, orderNumber and razorpayPaymentId', async () => {
      const prisma = getPrisma();
      const product = await prisma.product.findFirstOrThrow({
        include: { variants: true, category: true },
      });
      const variant = product.variants[0]!;

      await expect(
        prisma.user.create({ data: { email: 'admin@example.test' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.product.create({
          data: {
            name: 'dup',
            slug: 'dup-slug',
            sku: product.sku,
            categoryId: product.categoryId,
            hsnCode: '3307',
            gstRate: 5,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.product.create({
          data: {
            name: 'dup',
            slug: product.slug,
            sku: 'NEW-SKU',
            categoryId: product.categoryId,
            hsnCode: '3307',
            gstRate: 5,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.productVariant.create({
          data: { productId: product.id, sku: variant.sku, label: 'x', price: 1, weightGrams: 1 },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.category.create({ data: { name: 'x', slug: product.category.slug } }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.order.create({
        data: orderBase(adminId, { orderNumber: 'PE-20260001', razorpayPaymentId: 'pay_1' }),
      });
      await expect(
        prisma.order.create({ data: orderBase(adminId, { orderNumber: 'PE-20260001' }) }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.order.create({ data: orderBase(adminId, { razorpayPaymentId: 'pay_1' }) }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('check constraints', () => {
    it('accepts a TN-style CGST+SGST pair and an IGST-only order', async () => {
      const prisma = getPrisma();

      await expect(prisma.order.create({ data: orderBase(adminId) })).resolves.toBeDefined();
      await expect(
        prisma.order.create({
          data: orderBase(adminId, {
            destinationState: 'MH',
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 381,
          }),
        }),
      ).resolves.toBeDefined();
      await expect(
        prisma.order.create({
          data: orderBase(adminId, {
            subtotal: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            total: 0,
          }),
        }),
      ).resolves.toBeDefined();
    });

    it('rejects an order carrying both CGST and IGST, or no tax with a positive total', async () => {
      const prisma = getPrisma();

      await expect(
        prisma.order.create({ data: orderBase(adminId, { igstAmount: 5 }) }),
      ).rejects.toThrow(/order_tax_pair/);
      await expect(
        prisma.order.create({
          data: orderBase(adminId, { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }),
        }),
      ).rejects.toThrow(/order_tax_pair/);
    });

    it('rejects quantity 0, rating 6, zero stock delta, negative stock and 5 return photos', async () => {
      const prisma = getPrisma();
      const order = await prisma.order.create({ data: orderBase(adminId) });

      await expect(
        prisma.orderItem.create({
          data: {
            orderId: order.id,
            variantId,
            productName: 'p',
            variantLabel: 'v',
            sku: 's',
            unitPrice: 1,
            quantity: 0,
            hsnCode: '3307',
            gstRate: 5,
          },
        }),
      ).rejects.toThrow(/order_item_qty_positive/);
      const item = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          variantId,
          productName: 'p',
          variantLabel: 'v',
          sku: 's',
          unitPrice: 1,
          quantity: 1,
          hsnCode: '3307',
          gstRate: 5,
        },
      });
      const productId = (
        await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
      ).productId;
      await expect(
        prisma.review.create({
          data: { productId, orderItemId: item.id, userId: adminId, rating: 6, body: 'x' },
        }),
      ).rejects.toThrow(/review_rating_range/);
      await expect(
        prisma.stockMovement.create({ data: { variantId, delta: 0, reason: 'ADJUSTMENT' } }),
      ).rejects.toThrow(/stock_movement_delta_nonzero/);
      await expect(
        getPrismaRaw()
          .$executeRaw`UPDATE "product_variant" SET "stock" = -1 WHERE "id" = ${variantId}::uuid`,
      ).rejects.toThrow(/variant_stock_nonnegative/);
      await expect(
        prisma.returnRequest.create({
          data: {
            orderId: order.id,
            orderItemId: item.id,
            userId: adminId,
            reason: 'EXPIRED',
            description: 'x',
            photoKeys: ['1', '2', '3', '4', '5'],
          },
        }),
      ).rejects.toThrow(/return_photo_count/);
      await expect(
        prisma.returnRequest.create({
          data: {
            orderId: order.id,
            orderItemId: item.id,
            userId: adminId,
            reason: 'EXPIRED',
            description: 'x',
            photoKeys: [],
          },
        }),
      ).rejects.toThrow(/return_photo_count/);
    });
  });

  describe('append-only tables', () => {
    it('raises append_only on UPDATE of audit_log and DELETE of stock_movement', async () => {
      const prisma = getPrisma();
      const raw = getPrismaRaw();
      const audit = await prisma.auditLog.create({
        data: { actorId: adminId, action: 'test', entityType: 'user', entityId: adminId },
      });
      const movement = await prisma.stockMovement.findFirstOrThrow();

      await expect(
        prisma.auditLog.update({ where: { id: audit.id }, data: { action: 'tampered' } }),
      ).rejects.toThrow(/append_only/);
      await expect(
        raw.$executeRaw`DELETE FROM "stock_movement" WHERE "id" = ${movement.id}::uuid`,
      ).rejects.toThrow(/append_only/);
      await expect(raw.$executeRaw`DELETE FROM "audit_log"`).rejects.toThrow(/append_only/);
      await expect(raw.$executeRaw`UPDATE "stock_movement" SET "delta" = 999`).rejects.toThrow(
        /append_only/,
      );
      expect(await prisma.auditLog.count()).toBe(1);
    });
  });
});
