import { maskPhone } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import type { KeyProvider } from '../../ports/key-provider';
import { hashEmail } from '../notifications/suppression';

import { csvDocument } from './csv-safe';
import type { ExportDocument } from './products.export';

export const CUSTOMER_EXPORT_COLUMNS = [
  'id',
  'email_hash',
  'created_at',
  'order_count',
  'phone_masked',
  'is_disabled',
] as const;

export const CUSTOMER_EXPORT_FULL_COLUMNS = ['email', 'name', 'phone'] as const;

/** Customers export (P07 task 8): hashed email and masked phone unless `full` (ADMIN ⚡ + reason). */
export const buildCustomersExport = async (
  prisma: PrismaDb,
  keys: KeyProvider,
  options: { readonly full: boolean },
): Promise<ExportDocument> => {
  const customers = await prisma.user.findMany({
    where: { role: 'CUSTOMER', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      isDisabled: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  const rows = customers.map((customer) => {
    const base = [
      customer.id,
      hashEmail(keys, customer.email),
      customer.createdAt.toISOString(),
      String(customer._count.orders),
      customer.phone === null ? '' : maskPhone(customer.phone),
      String(customer.isDisabled),
    ];
    return options.full
      ? [...base, customer.email, customer.name ?? '', customer.phone ?? '']
      : base;
  });
  const header = options.full
    ? [...CUSTOMER_EXPORT_COLUMNS, ...CUSTOMER_EXPORT_FULL_COLUMNS]
    : [...CUSTOMER_EXPORT_COLUMNS];
  return { csv: csvDocument(header, rows), rows: rows.length };
};
