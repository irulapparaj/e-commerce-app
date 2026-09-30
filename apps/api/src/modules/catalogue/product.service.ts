import {
  AppError,
  DEFAULT_HSN_BY_CATEGORY,
  type ProductCommercialPatch,
  type ProductContentInput,
  type ProductContentPatch,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaTx } from '../../db/prisma';
import { recordAudit } from '../audit/record';
import { deleteDerivatives } from '../media/process.job';

import {
  ADMIN_PRODUCT_INCLUDE,
  type AdminProductRow,
  type CatalogueServiceDeps,
  defined,
  pick,
  productSnapshot,
  productTags,
  type ServiceContext,
  toDecimal,
} from './service-deps';
import { slugify, uniqueSlug } from './slug';

const FALLBACK_TAX = { hsnCode: '3307', gstRate: 5 } as const;

export interface ProductService {
  create(input: ProductContentInput, ctx: ServiceContext): Promise<AdminProductRow>;
  updateContent(
    id: string,
    patch: ProductContentPatch,
    ctx: ServiceContext,
  ): Promise<AdminProductRow>;
  updateCommercial(
    id: string,
    patch: ProductCommercialPatch,
    ctx: ServiceContext,
  ): Promise<AdminProductRow>;
  setActive(id: string, isActive: boolean, ctx: ServiceContext): Promise<AdminProductRow>;
  setFeatured(id: string, isFeatured: boolean, ctx: ServiceContext): Promise<AdminProductRow>;
  remove(id: string, ctx: ServiceContext): Promise<void>;
  get(id: string): Promise<AdminProductRow>;
}

type Tx = Pick<PrismaTx, 'product' | 'auditLog' | 'orderItem' | 'stockMovement' | 'category'>;

const loadProduct = async (db: Pick<Tx, 'product'>, id: string): Promise<AdminProductRow> => {
  const row = await db.product.findUnique({ where: { id }, include: ADMIN_PRODUCT_INCLUDE });
  if (row === null) throw new AppError('NOT_FOUND', 'Product not found');
  return row;
};

const validationError = (path: string, message: string): AppError =>
  new AppError('VALIDATION', message, { details: [{ path, message }] });

/**
 * Catalogue writes for products (P04 task 7). Every method runs in one transaction, records an audit
 * row and enqueues revalidation for the affected storefront tags. Slugs are generated here, never
 * accepted from input, and stay stable after creation so published URLs never break.
 */
export const createProductService = (deps: CatalogueServiceDeps): ProductService => {
  const { prisma, revalidate } = deps;

  const resolveCategory = async (categoryId: string) => {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, slug: true, parent: { select: { slug: true } } },
    });
    if (category === null) throw validationError('categoryId', 'Unknown category');
    return category;
  };

  const ensureSkuFree = async (sku: string, exceptId?: string): Promise<void> => {
    const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    if (existing !== null && existing.id !== exceptId)
      throw new AppError('CONFLICT', 'A product with this SKU already exists');
  };

  const create: ProductService['create'] = async (input, ctx) => {
    const category = await resolveCategory(input.categoryId);
    await ensureSkuFree(input.sku);
    const tax = DEFAULT_HSN_BY_CATEGORY[category.parent?.slug ?? category.slug] ?? FALLBACK_TAX;
    const slug = await uniqueSlug(
      slugify(input.name),
      async (candidate) =>
        (await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } })) !==
        null,
    );
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.product.create({
        data: {
          name: input.name,
          sku: input.sku,
          slug,
          categoryId: category.id,
          description: input.description as unknown as Prisma.InputJsonValue,
          specifications: input.specifications,
          howToUse: input.howToUse,
          tags: input.tags,
          hsnCode: tax.hsnCode,
          gstRate: toDecimal(tax.gstRate),
          isActive: false,
        },
        include: ADMIN_PRODUCT_INCLUDE,
      });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'product.created',
        entityType: 'product',
        entityId: row.id,
        after: productSnapshot(row),
      });
      return row;
    });
    await revalidate.notify(productTags(created));
    return created;
  };

  const applyUpdate = async (
    id: string,
    action: string,
    data: Prisma.ProductUpdateInput,
    changedKeys: readonly string[],
    ctx: ServiceContext,
  ): Promise<AdminProductRow> => {
    const before = await loadProduct(prisma, id);
    const after = await prisma.$transaction(async (tx) => {
      const row = await tx.product.update({ where: { id }, data, include: ADMIN_PRODUCT_INCLUDE });
      await recordAudit(tx, {
        ...ctx.actor,
        action,
        entityType: 'product',
        entityId: id,
        before: pick(productSnapshot(before), changedKeys),
        after: pick(productSnapshot(row), changedKeys),
      });
      return row;
    });
    await revalidate.notify([...productTags(before), ...productTags(after)]);
    return after;
  };

  const updateContent: ProductService['updateContent'] = async (id, patch, ctx) => {
    if (patch.categoryId !== undefined) await resolveCategory(patch.categoryId);
    if (patch.sku !== undefined) await ensureSkuFree(patch.sku, id);
    const data = defined({
      name: patch.name,
      sku: patch.sku,
      categoryId: patch.categoryId,
      description: patch.description as unknown as Prisma.InputJsonValue | undefined,
      specifications: patch.specifications,
      howToUse: patch.howToUse,
      tags: patch.tags,
    });
    return applyUpdate(id, 'product.content_updated', data, Object.keys(data), ctx);
  };

  const updateCommercial: ProductService['updateCommercial'] = async (id, patch, ctx) => {
    const data = defined({
      hsnCode: patch.hsnCode,
      gstRate: patch.gstRate === undefined ? undefined : toDecimal(patch.gstRate),
      isFeatured: patch.isFeatured,
      metaTitle: patch.metaTitle,
      metaDescription: patch.metaDescription,
    });
    return applyUpdate(id, 'product.commercial_updated', data, Object.keys(data), ctx);
  };

  const setActive: ProductService['setActive'] = async (id, isActive, ctx) => {
    const current = await loadProduct(prisma, id);
    if (isActive && (current.variants.length === 0 || current.images.length === 0)) {
      throw new AppError('PRODUCT_INCOMPLETE', undefined, {
        details: { variants: current.variants.length, images: current.images.length },
      });
    }
    return applyUpdate(
      id,
      isActive ? 'product.published' : 'product.unpublished',
      { isActive },
      ['isActive'],
      ctx,
    );
  };

  const setFeatured: ProductService['setFeatured'] = (id, isFeatured, ctx) =>
    updateCommercial(id, { isFeatured }, ctx);

  const remove: ProductService['remove'] = async (id, ctx) => {
    const row = await loadProduct(prisma, id);
    const variantIds = row.variants.map((variant) => variant.id);
    const [ordered, moved] = await Promise.all([
      prisma.orderItem.count({ where: { variantId: { in: variantIds } } }),
      prisma.stockMovement.count({ where: { variantId: { in: variantIds } } }),
    ]);
    if (ordered > 0)
      throw new AppError('CONFLICT', 'Product has been ordered; unpublish it instead of deleting');
    if (moved > 0)
      throw new AppError('CONFLICT', 'Product has stock history; unpublish it instead of deleting');
    await prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'product.deleted',
        entityType: 'product',
        entityId: id,
        before: productSnapshot(row),
      });
    });
    await Promise.all(
      row.images.map((image) => deleteDerivatives(deps.storage, deps.bucket, image.objectKey)),
    );
    await revalidate.notify(productTags(row));
  };

  return {
    create,
    updateContent,
    updateCommercial,
    setActive,
    setFeatured,
    remove,
    get: (id) => loadProduct(prisma, id),
  };
};
