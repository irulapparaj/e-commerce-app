/**
 * URL filter keys shared by server pages and client filter bars. They live outside any
 * `'use client'` module on purpose: a server component importing a value from a client module
 * receives a client reference, not the array.
 */
export const AUDIT_FILTER_KEYS = [
  'actorId',
  'entityType',
  'entityId',
  'action',
  'from',
  'to',
] as const;
export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];
export type AuditFilterValues = Readonly<Partial<Record<AuditFilterKey, string>>>;

export const PRODUCT_FILTER_KEYS = ['q', 'status', 'category'] as const;
export type ProductFilterKey = (typeof PRODUCT_FILTER_KEYS)[number];
export type ProductFilterValues = Readonly<Partial<Record<ProductFilterKey, string>>>;

export const STOCK_FILTER_KEYS = ['q', 'category', 'belowThreshold'] as const;
export type StockFilterKey = (typeof STOCK_FILTER_KEYS)[number];
export type StockFilterValues = Readonly<Partial<Record<StockFilterKey, string>>>;

export const LEDGER_FILTER_KEYS = ['variantId', 'reason', 'from', 'to'] as const;
export type LedgerFilterKey = (typeof LEDGER_FILTER_KEYS)[number];
export type LedgerFilterValues = Readonly<Partial<Record<LedgerFilterKey, string>>>;

export const CUSTOMER_FILTER_KEYS = ['q'] as const;
export type CustomerFilterKey = (typeof CUSTOMER_FILTER_KEYS)[number];
export type CustomerFilterValues = Readonly<Partial<Record<CustomerFilterKey, string>>>;

export const ORDER_FILTER_KEYS = ['q', 'status', 'paymentStatus', 'from', 'to'] as const;
export type OrderFilterKey = (typeof ORDER_FILTER_KEYS)[number];
export type OrderFilterValues = Readonly<Partial<Record<OrderFilterKey, string>>>;
