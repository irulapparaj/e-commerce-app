import type { Pagination } from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaDb } from './prisma';

/**
 * Typed `where` fragments that bind a query to the authenticated user (DESIGN §11.3 Authorisation).
 * Repository functions for these models must accept `userId` and spread the matching fragment.
 */
export const forUser = (userId: string) =>
  ({
    address: { userId } satisfies Prisma.AddressWhereInput,
    order: { userId } satisfies Prisma.OrderWhereInput,
    returnRequest: { userId } satisfies Prisma.ReturnRequestWhereInput,
    wishlistItem: { userId } satisfies Prisma.WishlistItemWhereInput,
    refreshToken: { userId } satisfies Prisma.RefreshTokenWhereInput,
  }) as const;

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** Reference implementation of the scoping pattern; later plans copy its shape. */
export const findOrdersForUser = async (
  db: Pick<PrismaDb, 'order'>,
  userId: string,
  { page, limit }: Pagination,
): Promise<Page<Prisma.OrderGetPayload<{ include: { items: true } }>>> => {
  const where = forUser(userId).order;
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.order.count({ where }),
  ]);
  return { items, total };
};
