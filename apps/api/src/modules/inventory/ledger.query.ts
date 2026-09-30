import type { Prisma, StockReason } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';

export interface MovementRow {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productName: string;
  readonly label: string;
  readonly delta: number;
  readonly reason: StockReason;
  readonly referenceId: string | null;
  readonly actor: { readonly id: string; readonly email: string } | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface MovementQuery {
  readonly variantId?: string | undefined;
  readonly reason?: StockReason | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly page: number;
  readonly limit: number;
}

const whereFor = (query: MovementQuery): Prisma.StockMovementWhereInput => ({
  ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
  ...(query.reason === undefined ? {} : { reason: query.reason }),
  ...(query.from === undefined && query.to === undefined
    ? {}
    : {
        createdAt: {
          ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
          ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
        },
      }),
});

/** Movement ledger with filters, newest first (P06 task 5). */
export const listMovements = async (
  prisma: PrismaDb,
  query: MovementQuery,
): Promise<{ rows: readonly MovementRow[]; total: number }> => {
  const where = whereFor(query);
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        variant: { select: { sku: true, label: true, product: { select: { name: true } } } },
        actor: { select: { id: true, email: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      label: row.variant.label,
      delta: row.delta,
      reason: row.reason,
      referenceId: row.referenceId,
      actor: row.actor,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
};
