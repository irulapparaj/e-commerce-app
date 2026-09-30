import type { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

import type { PrismaDb } from '../../../db/prisma';
import type { KeyProvider } from '../../../ports/key-provider';

const PAGE_LIMIT = 20;

export interface OrderListQuery {
  readonly status?: OrderStatus | undefined;
  readonly paymentStatus?: PaymentStatus | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly q?: string | undefined;
  readonly page?: number | undefined;
}

export interface OrderListRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly total: number;
  readonly itemCount: number;
  readonly trackingNumber: string | null;
  readonly courierName: string | null;
  readonly createdAt: string;
  readonly customer: {
    readonly id: string;
    readonly email: string;
  };
}

export interface OrderListResult {
  readonly data: readonly OrderListRow[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
  };
}

export const listOrders = async (
  prisma: PrismaDb,
  keys: KeyProvider,
  query: OrderListQuery,
): Promise<OrderListResult> => {
  const page = Math.max(1, query.page ?? 1);
  const skip = (page - 1) * PAGE_LIMIT;

  // Build where clause
  const where: Prisma.OrderWhereInput = {};

  if (query.status !== undefined) {
    where['status'] = query.status;
  }
  if (query.paymentStatus !== undefined) {
    where['paymentStatus'] = query.paymentStatus;
  }
  if (query.from !== undefined || query.to !== undefined) {
    where['createdAt'] = {
      ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
    };
  }

  // Search by order number, email prefix, or phone blind-index (exact HMAC equality)
  if (query.q !== undefined && query.q.trim().length > 0) {
    const searchTerm = query.q.trim();
    where['OR'] = [
      { orderNumber: { startsWith: searchTerm } },
      { email: { startsWith: searchTerm } },
      // Phone blind-index: HMAC the search term first, then do exact match.
      // A prefix of plaintext has no relation to a prefix of its HMAC, so startsWith would
      // always return nothing. Equality on the HMAC is the correct blind-index lookup.
      ...(searchTerm.match(/^\d{6,}$/)
        ? [{ phoneHmac: keys.blindIndex(searchTerm) }]
        : []),
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: PAGE_LIMIT,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        trackingNumber: true,
        courierName: true,
        createdAt: true,
        items: { select: { quantity: true } },
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const rows: OrderListRow[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    itemCount: o.items.reduce((acc, item) => acc + item.quantity, 0),
    trackingNumber: o.trackingNumber,
    courierName: o.courierName,
    createdAt: o.createdAt.toISOString(),
    customer: { id: o.user.id, email: o.user.email },
  }));

  return {
    data: rows,
    meta: { total, page, limit: PAGE_LIMIT },
  };
};
