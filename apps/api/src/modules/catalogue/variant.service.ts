import {
  AppError,
  type VariantContentPatch,
  type VariantCreateInput,
  type VariantPriceInput,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaTx } from '../../db/prisma';
import { recordAudit } from '../audit/record';

import {
  ADMIN_PRODUCT_INCLUDE,
  type AdminVariantRow,
  type CatalogueServiceDeps,
  defined,
  pick,
  productTags,
  type ServiceContext,
  variantSnapshot,
} from './service-deps';

export interface VariantService {
  create(
    productId: string,
    input: VariantCreateInput,
    ctx: ServiceContext,
  ): Promise<AdminVariantRow>;
  updateContent(
    productId: string,
    variantId: string,
    patch: VariantContentPatch,
    ctx: ServiceContext,
  ): Promise<AdminVariantRow>;
  updatePrice(
    productId: string,
    variantId: string,
    input: VariantPriceInput,
    ctx: ServiceContext,
  ): Promise<AdminVariantRow>;
  remove(productId: string, variantId: string, ctx: ServiceContext): Promise<void>;
}

type Tx = Pick<PrismaTx, 'productVariant' | 'auditLog'>;

const PRICE_KEYS = ['price', 'compareAtPrice'] as const;

/** Variant writes (P04 task 7). Price changes are audited with before/after values. */
export const createVariantService = (deps: CatalogueServiceDeps): VariantService => {
  const { prisma, revalidate } = deps;

  const loadProduct = async (productId: string) => {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: ADMIN_PRODUCT_INCLUDE,
    });
    if (product === null) throw new AppError('NOT_FOUND', 'Product not found');
    return product;
  };

  const loadVariant = async (productId: string, variantId: string): Promise<AdminVariantRow> => {
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (variant === null) throw new AppError('NOT_FOUND', 'Variant not found');
    return variant;
  };

  const ensureSkuFree = async (sku: string, exceptId?: string): Promise<void> => {
    const existing = await prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (existing !== null && existing.id !== exceptId)
      throw new AppError('CONFLICT', 'A variant with this SKU already exists');
  };

  const clearOtherDefaults = (tx: Tx, productId: string, exceptId: string) =>
    tx.productVariant.updateMany({
      where: { productId, id: { not: exceptId }, isDefault: true },
      data: { isDefault: false },
    });

  const create: VariantService['create'] = async (productId, input, ctx) => {
    const product = await loadProduct(productId);
    await ensureSkuFree(input.sku);
    const isDefault = input.isDefault || product.variants.length === 0;
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.productVariant.create({
        data: { ...input, isDefault, productId, stock: 0 },
      });
      if (isDefault) await clearOtherDefaults(tx, productId, row.id);
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'variant.created',
        entityType: 'variant',
        entityId: row.id,
        after: { productId, ...variantSnapshot(row) },
      });
      return row;
    });
    await revalidate.notify(productTags(product));
    return created;
  };

  const applyUpdate = async (
    productId: string,
    variantId: string,
    action: string,
    data: Prisma.ProductVariantUpdateInput,
    keys: readonly string[],
    ctx: ServiceContext,
  ): Promise<AdminVariantRow> => {
    const [product, before] = await Promise.all([
      loadProduct(productId),
      loadVariant(productId, variantId),
    ]);
    const after = await prisma.$transaction(async (tx) => {
      const row = await tx.productVariant.update({ where: { id: variantId }, data });
      if (row.isDefault && !before.isDefault) await clearOtherDefaults(tx, productId, variantId);
      await recordAudit(tx, {
        ...ctx.actor,
        action,
        entityType: 'variant',
        entityId: variantId,
        before: pick(variantSnapshot(before), keys),
        after: pick(variantSnapshot(row), keys),
      });
      return row;
    });
    await revalidate.notify(productTags(product));
    return after;
  };

  const updateContent: VariantService['updateContent'] = async (
    productId,
    variantId,
    patch,
    ctx,
  ) => {
    if (patch.sku !== undefined) await ensureSkuFree(patch.sku, variantId);
    const data = defined({
      sku: patch.sku,
      label: patch.label,
      weightGrams: patch.weightGrams,
      isDefault: patch.isDefault,
      lowStockThreshold: patch.lowStockThreshold,
    });
    return applyUpdate(productId, variantId, 'variant.updated', data, Object.keys(data), ctx);
  };

  const updatePrice: VariantService['updatePrice'] = (productId, variantId, input, ctx) =>
    applyUpdate(
      productId,
      variantId,
      'variant.price_updated',
      { price: input.price, compareAtPrice: input.compareAtPrice },
      PRICE_KEYS,
      ctx,
    );

  const remove: VariantService['remove'] = async (productId, variantId, ctx) => {
    const [product, variant] = await Promise.all([
      loadProduct(productId),
      loadVariant(productId, variantId),
    ]);
    const [ordered, moved] = await Promise.all([
      prisma.orderItem.count({ where: { variantId } }),
      prisma.stockMovement.count({ where: { variantId } }),
    ]);
    if (ordered > 0)
      throw new AppError('CONFLICT', 'Variant has been ordered and cannot be deleted');
    if (moved > 0)
      throw new AppError('CONFLICT', 'Variant has stock history and cannot be deleted');
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.delete({ where: { id: variantId } });
      if (variant.isDefault) {
        const next = await tx.productVariant.findFirst({
          where: { productId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next !== null)
          await tx.productVariant.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'variant.deleted',
        entityType: 'variant',
        entityId: variantId,
        before: { productId, ...variantSnapshot(variant) },
      });
    });
    await revalidate.notify(productTags(product));
  };

  return { create, updateContent, updatePrice, remove };
};
