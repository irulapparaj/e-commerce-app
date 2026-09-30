import { Prisma } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

import { PRODUCT_SUMMARY_INCLUDE, type ProductSummaryRow } from './dto';
import type { CollectionSort } from './filters';

export interface ListProductsArgs {
  readonly categoryIds?: readonly string[];
  readonly sort: CollectionSort;
  readonly minPrice?: number | undefined;
  readonly maxPrice?: number | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface ListProductsResult {
  readonly rows: readonly ProductSummaryRow[];
  readonly total: number;
}

const ORDER_BY: Readonly<Record<CollectionSort, Prisma.Sql>> = {
  featured: Prisma.sql`p."is_featured" DESC, p."created_at" DESC`,
  newest: Prisma.sql`p."created_at" DESC`,
  price_asc: Prisma.sql`dv."price" ASC, p."created_at" DESC`,
  price_desc: Prisma.sql`dv."price" DESC, p."created_at" DESC`,
};

const uuidList = (ids: readonly string[]): Prisma.Sql =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/** Price filters and price sorts apply to the default variant (P04 task 3). */
const whereClause = (args: ListProductsArgs): Prisma.Sql => {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."is_active" = true`];
  if (args.categoryIds !== undefined) {
    if (args.categoryIds.length === 0) return Prisma.sql`false`;
    conditions.push(Prisma.sql`p."category_id" IN (${uuidList(args.categoryIds)})`);
  }
  if (args.minPrice !== undefined) conditions.push(Prisma.sql`dv."price" >= ${args.minPrice}`);
  if (args.maxPrice !== undefined) conditions.push(Prisma.sql`dv."price" <= ${args.maxPrice}`);
  return Prisma.join(conditions, ' AND ');
};

/**
 * LATERAL join for the default variant price.
 * Using LATERAL instead of a CTE avoids a full-table scan of product_variant on every collection
 * request: the subquery executes once per product row using the index on product_id, rather than
 * materialising all variants upfront.
 */
const DEFAULT_VARIANT_LATERAL = Prisma.sql`
  JOIN LATERAL (
    SELECT v."price"
    FROM "product_variant" v
    WHERE v."product_id" = p."id"
    ORDER BY v."is_default" DESC, v."price" ASC
    LIMIT 1
  ) dv ON true`;

/** Two raw queries (id page + count) then a Prisma hydration keeps sorting in SQL and typing in Prisma. */
export const listProducts = async (
  prisma: PrismaDb,
  args: ListProductsArgs,
): Promise<ListProductsResult> => {
  const where = whereClause(args);
  const offset = (args.page - 1) * args.limit;
  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "product" p
      ${DEFAULT_VARIANT_LATERAL}
      WHERE ${where}
      ORDER BY ${ORDER_BY[args.sort]}, p."id"
      LIMIT ${args.limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM "product" p
      ${DEFAULT_VARIANT_LATERAL}
      WHERE ${where}`,
  ]);
  const ids = idRows.map((row) => row.id);
  const hydrated = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: PRODUCT_SUMMARY_INCLUDE,
  });
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  return {
    rows: ids
      .map((id) => byId.get(id))
      .filter((row): row is ProductSummaryRow => row !== undefined),
    total: countRows[0]?.total ?? 0,
  };
};

export interface PriceBounds {
  readonly min: number;
  readonly max: number;
  readonly buckets: readonly number[];
}

/** Bars in the storefront price-filter histogram. */
export const HISTOGRAM_BUCKETS = 20;

/**
 * Default-variant price spread of a scope, ignoring any price filter: the storefront slider needs
 * stable bounds (and a stable histogram) while the user narrows within them. Null when the scope
 * has no active products; buckets are empty when every product shares one price.
 */
export const findPriceBounds = async (
  prisma: PrismaDb,
  categoryIds?: readonly string[],
): Promise<PriceBounds | null> => {
  const where = whereClause({
    ...(categoryIds === undefined ? {} : { categoryIds }),
    sort: 'featured',
    page: 1,
    limit: 1,
  });
  const rows = await prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
    SELECT min(dv."price")::int AS min, max(dv."price")::int AS max
    FROM "product" p
    ${DEFAULT_VARIANT_LATERAL}
    WHERE ${where}`;
  const bounds = rows[0];
  if (bounds === undefined || bounds.min === null || bounds.max === null) return null;
  if (bounds.max <= bounds.min) return { min: bounds.min, max: bounds.max, buckets: [] };

  // Prisma binds numbers as bigint, which matches no width_bucket overload — cast explicitly.
  const counted = await prisma.$queryRaw<{ bucket: number; count: number }[]>`
    SELECT width_bucket(dv."price"::numeric, ${bounds.min}::numeric, ${bounds.max}::numeric,
                        ${HISTOGRAM_BUCKETS}::int) AS bucket,
           count(*)::int AS count
    FROM "product" p
    ${DEFAULT_VARIANT_LATERAL}
    WHERE ${where}
    GROUP BY 1`;
  // width_bucket puts the exact maximum into bucket N+1; fold it into the last bar.
  const byBucket = new Map<number, number>();
  for (const row of counted) {
    const index = Math.min(Math.max(row.bucket, 1), HISTOGRAM_BUCKETS) - 1;
    byBucket.set(index, (byBucket.get(index) ?? 0) + row.count);
  }
  return {
    min: bounds.min,
    max: bounds.max,
    buckets: Array.from({ length: HISTOGRAM_BUCKETS }, (_, index) => byBucket.get(index) ?? 0),
  };
};

export interface CategoryScope {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  /** The category itself plus its direct children (two-level taxonomy). */
  readonly ids: readonly string[];
}

export const findCategoryScope = async (
  prisma: PrismaDb,
  slug: string,
): Promise<CategoryScope | null> => {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      children: { select: { id: true } },
    },
  });
  if (category === null) return null;
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    parentId: category.parentId,
    ids: [category.id, ...category.children.map((child) => child.id)],
  };
};

export const PRODUCT_DETAIL_INCLUDE = {
  ...PRODUCT_SUMMARY_INCLUDE,
  images: { orderBy: { sortOrder: 'asc' } },
  category: {
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      parent: { select: { slug: true, name: true } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_DETAIL_INCLUDE }>;

export const findActiveProductBySlug = (
  prisma: PrismaDb,
  slug: string,
): Promise<ProductDetailRow | null> =>
  prisma.product.findFirst({ where: { slug, isActive: true }, include: PRODUCT_DETAIL_INCLUDE });

export const findProductsByIds = async (
  prisma: PrismaDb,
  ids: readonly string[],
): Promise<readonly ProductSummaryRow[]> => {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: [...ids] }, isActive: true },
    include: PRODUCT_SUMMARY_INCLUDE,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ProductSummaryRow => row !== undefined);
};
