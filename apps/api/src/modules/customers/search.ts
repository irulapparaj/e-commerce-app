import { PHONE_PATTERN } from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';

import { CUSTOMER_ROW_SELECT, type CustomerRow, toCustomerRow } from './detail.dto';

export type QueryKind = 'none' | 'email' | 'phone' | 'order';

const ORDER_NUMBER_PATTERN = /^PE-\d{4,}$/i;

/** Email prefix, 10-digit phone (blind index) or order number `PE-…` (P08 task 2). */
export const classifyQuery = (raw: string): { kind: QueryKind; value: string } => {
  const value = raw.trim();
  if (value === '') return { kind: 'none', value };
  if (PHONE_PATTERN.test(value)) return { kind: 'phone', value };
  if (ORDER_NUMBER_PATTERN.test(value)) return { kind: 'order', value: value.toUpperCase() };
  return { kind: 'email', value: value.toLowerCase() };
};

export interface CustomerSearch {
  readonly q?: string | undefined;
  readonly page: number;
  readonly limit: number;
}

const whereFor = async (
  prisma: PrismaDb,
  keys: KeyProvider,
  q: string | undefined,
): Promise<Prisma.UserWhereInput> => {
  const base: Prisma.UserWhereInput = { role: 'CUSTOMER' };
  const query = classifyQuery(q ?? '');
  switch (query.kind) {
    case 'none':
      return base;
    case 'email':
      return { ...base, email: { startsWith: query.value, mode: 'insensitive' } };
    case 'phone':
      return { ...base, phoneHmac: keys.blindIndex(query.value) };
    case 'order': {
      const order = await prisma.order.findUnique({
        where: { orderNumber: query.value },
        select: { userId: true },
      });
      return order === null ? { ...base, id: { in: [] } } : { ...base, id: order.userId };
    }
  }
};

/** Customers only (staff accounts are never listed here), newest first, masked rows. */
export const listCustomers = async (
  prisma: PrismaDb,
  keys: KeyProvider,
  search: CustomerSearch,
): Promise<{ rows: readonly CustomerRow[]; total: number }> => {
  const where = await whereFor(prisma, keys, search.q);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: CUSTOMER_ROW_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (search.page - 1) * search.limit,
      take: search.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { rows: rows.map(toCustomerRow), total };
};
