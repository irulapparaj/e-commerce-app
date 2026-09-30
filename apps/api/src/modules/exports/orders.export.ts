import { maskPhone, paiseToRupeesString } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';

import { csvDocument } from './csv-safe';
import type { ExportDocument } from './products.export';

export const ORDER_EXPORT_COLUMNS = [
  'order_number',
  'created_at',
  'status',
  'payment_status',
  'subtotal_inr',
  'shipping_inr',
  'discount_inr',
  'cgst_inr',
  'sgst_inr',
  'igst_inr',
  'total_inr',
  'city',
  'state',
  'pincode',
  'phone_masked',
  'courier',
  'tracking_number',
  'items',
] as const;

/** Only with `full=true` (ADMIN ⚡ + reason, audited): names, contact details and address lines. */
export const ORDER_EXPORT_FULL_COLUMNS = [
  'customer_email',
  'customer_name',
  'phone',
  'address_line1',
  'address_line2',
] as const;

interface ShippingSnapshot {
  readonly name?: unknown;
  readonly phone?: unknown;
  readonly line1?: unknown;
  readonly line2?: unknown;
  readonly city?: unknown;
  readonly state?: unknown;
  readonly pincode?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const snapshotOf = (value: unknown): ShippingSnapshot =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

/** Orders export (P07 task 8): PII-minimised by default; `full` adds the identifying columns. */
export const buildOrdersExport = async (
  prisma: PrismaDb,
  options: { readonly full: boolean },
): Promise<ExportDocument> => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'asc' },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });
  const rows = orders.map((order) => {
    const address = snapshotOf(order.shippingAddress);
    const base = [
      order.orderNumber,
      order.createdAt.toISOString(),
      order.status,
      order.paymentStatus,
      paiseToRupeesString(order.subtotal),
      paiseToRupeesString(order.shippingAmount),
      paiseToRupeesString(order.discountAmount),
      paiseToRupeesString(order.cgstAmount),
      paiseToRupeesString(order.sgstAmount),
      paiseToRupeesString(order.igstAmount),
      paiseToRupeesString(order.total),
      text(address.city),
      text(address.state) || order.destinationState,
      text(address.pincode),
      maskPhone(order.phone),
      order.courierName ?? '',
      order.trackingNumber ?? '',
      order.items.map((item) => `${item.sku}×${item.quantity}`).join('|'),
    ];
    return options.full
      ? [
          ...base,
          order.email,
          text(address.name),
          order.phone,
          text(address.line1),
          text(address.line2),
        ]
      : base;
  });
  const header = options.full
    ? [...ORDER_EXPORT_COLUMNS, ...ORDER_EXPORT_FULL_COLUMNS]
    : [...ORDER_EXPORT_COLUMNS];
  return { csv: csvDocument(header, rows), rows: rows.length };
};
