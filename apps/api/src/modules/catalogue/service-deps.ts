import { Prisma } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { JsonCache } from '../../lib/cache';
import type { ObjectStoragePort } from '../../ports/object-storage';
import type { AuditActor } from '../audit/record';
import type { RevalidateNotifier } from '../revalidate/notify';
import { tagsForProduct } from '../revalidate/tags';

export interface CatalogueServiceDeps {
  readonly prisma: PrismaDb;
  readonly revalidate: RevalidateNotifier;
  readonly cache: JsonCache;
  readonly storage: ObjectStoragePort;
  readonly bucket: string;
}

export interface ServiceContext {
  readonly actor: AuditActor;
}

export const ADMIN_PRODUCT_INCLUDE = {
  category: {
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      parent: { select: { slug: true } },
    },
  },
  variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

export type AdminProductRow = Prisma.ProductGetPayload<{ include: typeof ADMIN_PRODUCT_INCLUDE }>;
export type AdminVariantRow = AdminProductRow['variants'][number];
export type AdminImageRow = AdminProductRow['images'][number];

/** Strips `undefined` so partial patches satisfy Prisma's update types under exactOptionalPropertyTypes. */
export const defined = <T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };

export const pick = <T extends object>(value: T, keys: readonly string[]): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key))) as Partial<T>;

export const productTags = (row: AdminProductRow): readonly string[] =>
  tagsForProduct({
    slug: row.slug,
    categorySlug: row.category.slug,
    parentCategorySlug: row.category.parent?.slug,
    isFeatured: row.isFeatured,
  });

/** Audit snapshot of a product: business fields only, never the relations. */
export const productSnapshot = (row: AdminProductRow): Record<string, unknown> => ({
  name: row.name,
  sku: row.sku,
  slug: row.slug,
  categoryId: row.categoryId,
  hsnCode: row.hsnCode,
  gstRate: Number(row.gstRate.toString()),
  isActive: row.isActive,
  isFeatured: row.isFeatured,
  tags: row.tags,
  specifications: row.specifications,
  howToUse: row.howToUse,
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
});

export const variantSnapshot = (row: AdminVariantRow): Record<string, unknown> => ({
  sku: row.sku,
  label: row.label,
  price: row.price,
  compareAtPrice: row.compareAtPrice,
  weightGrams: row.weightGrams,
  isDefault: row.isDefault,
  lowStockThreshold: row.lowStockThreshold,
});

export const toDecimal = (value: number): Prisma.Decimal => new Prisma.Decimal(value);
