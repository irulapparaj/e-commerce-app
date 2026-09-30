import type { PrismaDb } from '../../db/prisma';

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const WEEK_DAYS = 7;

/** Start of the current calendar day in Asia/Kolkata (fixed +05:30, no DST), as a UTC instant. */
export const startOfIstDay = (now: Date): Date => {
  const shifted = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
};

export interface AdminStats {
  readonly ordersToday: number;
  readonly orders7d: number;
  readonly revenueTodayPaise: number;
  readonly revenue7dPaise: number;
  readonly productsActive: number;
  readonly lowStockCount: number;
  readonly pendingReturns: number;
  readonly customersTotal: number;
  readonly gstProfileIsPlaceholder: boolean;
}

interface CountRow {
  readonly n: number;
}

/** Cheap aggregates for the dashboard tiles (P05 task 6); orders and returns stay 0 until P12/P22. */
export const computeStats = async (
  prisma: PrismaDb,
  now: Date,
  gstProfileIsPlaceholder: boolean,
): Promise<AdminStats> => {
  const today = startOfIstDay(now);
  const weekAgo = new Date(now.getTime() - WEEK_DAYS * DAY_MS);
  const paid = { paymentStatus: 'PAID' as const };
  const [
    ordersToday,
    orders7d,
    revenueToday,
    revenue7d,
    productsActive,
    lowStock,
    pendingReturns,
    customersTotal,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.order.aggregate({
      where: { ...paid, createdAt: { gte: today } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...paid, createdAt: { gte: weekAgo } },
      _sum: { total: true },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.$queryRaw<CountRow[]>`
      SELECT count(*)::int AS n FROM "product_variant" v JOIN "product" p ON p."id" = v."product_id"
      WHERE p."is_active" = true AND v."stock" <= v."low_stock_threshold"`,
    prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
  ]);
  return {
    ordersToday,
    orders7d,
    revenueTodayPaise: revenueToday._sum.total ?? 0,
    revenue7dPaise: revenue7d._sum.total ?? 0,
    productsActive,
    lowStockCount: lowStock[0]?.n ?? 0,
    pendingReturns,
    customersTotal,
    gstProfileIsPlaceholder,
  };
};
