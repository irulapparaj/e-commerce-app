import { Prisma } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

export interface StockRow {
  readonly variantId: string;
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly label: string;
  readonly stock: number;
  readonly lowStockThreshold: number;
  readonly isLow: boolean;
  readonly lastMovementAt: string | null;
}

export interface StockQuery {
  readonly q?: string | undefined;
  readonly categoryId?: string | undefined;
  readonly belowThreshold?: boolean | undefined;
  readonly page: number;
  readonly limit: number;
}

interface RawStockRow {
  readonly variant_id: string;
  readonly sku: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly product_slug: string;
  readonly label: string;
  readonly stock: number;
  readonly low_stock_threshold: number;
  readonly last_movement_at: Date | null;
}

const LOW_STOCK_LIMIT = 200;

const toRow = (row: RawStockRow): StockRow => ({
  variantId: row.variant_id,
  sku: row.sku,
  productId: row.product_id,
  productName: row.product_name,
  productSlug: row.product_slug,
  label: row.label,
  stock: row.stock,
  lowStockThreshold: row.low_stock_threshold,
  isLow: row.stock <= row.low_stock_threshold,
  lastMovementAt: row.last_movement_at?.toISOString() ?? null,
});

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const whereFor = (query: Omit<StockQuery, 'page' | 'limit'>): Prisma.Sql => {
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];
  if (query.q !== undefined && query.q.trim() !== '') {
    const pattern = `%${escapeLike(query.q.trim())}%`;
    conditions.push(
      Prisma.sql`(v."sku" ILIKE ${pattern} OR p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern})`,
    );
  }
  if (query.categoryId !== undefined) {
    conditions.push(
      Prisma.sql`(p."category_id" = ${query.categoryId}::uuid OR p."category_id" IN (SELECT "id" FROM "category" WHERE "parent_id" = ${query.categoryId}::uuid))`,
    );
  }
  if (query.belowThreshold === true)
    conditions.push(Prisma.sql`v."stock" <= v."low_stock_threshold"`);
  return Prisma.join(conditions, ' AND ');
};

const SELECT = Prisma.sql`
  SELECT v."id" AS variant_id, v."sku", p."id" AS product_id, p."name" AS product_name, p."slug" AS product_slug,
         v."label", v."stock", v."low_stock_threshold",
         (SELECT max(m."created_at") FROM "stock_movement" m WHERE m."variant_id" = v."id") AS last_movement_at
  FROM "product_variant" v JOIN "product" p ON p."id" = v."product_id"`;

/** Stock table (P06 task 5): `stock <= threshold` needs SQL, so the whole listing is one raw query. */
export const listStock = async (
  prisma: PrismaDb,
  query: StockQuery,
): Promise<{ rows: readonly StockRow[]; total: number }> => {
  const where = whereFor(query);
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      RawStockRow[]
    >`${SELECT} WHERE ${where} ORDER BY p."name" ASC, v."label" ASC LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
    prisma.$queryRaw<
      { total: number }[]
    >`SELECT count(*)::int AS total FROM "product_variant" v JOIN "product" p ON p."id" = v."product_id" WHERE ${where}`,
  ]);
  return { rows: rows.map(toRow), total: count[0]?.total ?? 0 };
};

/** Every variant at or below its threshold, active products first, most depleted first. */
export const listLowStock = async (prisma: PrismaDb): Promise<readonly StockRow[]> => {
  const rows = await prisma.$queryRaw<RawStockRow[]>`
    ${SELECT} WHERE v."stock" <= v."low_stock_threshold"
    ORDER BY p."is_active" DESC, (v."low_stock_threshold" - v."stock") DESC, p."name" ASC
    LIMIT ${LOW_STOCK_LIMIT}`;
  return rows.map(toRow);
};
