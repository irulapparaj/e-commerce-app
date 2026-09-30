'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { OrderFilterValues } from '@/lib/admin/filter-keys';
import {
  formatDateTime,
  formatPaise,
} from '@/lib/admin/format';
import type { OrderRow } from '@/lib/admin/order-types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE,
} from '@/lib/admin/order-types';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';
import { FormField } from '../FormField';

interface OrderTableProps {
  readonly rows: readonly OrderRow[];
  readonly pagination: PaginationState;
  readonly filters: OrderFilterValues;
}

export function OrderStatusBadge({ status }: { readonly status: OrderRow['status'] }) {
  return (
    <span className={ORDER_STATUS_TONE[status]} data-testid="order-status">
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { readonly status: OrderRow['paymentStatus'] }) {
  return (
    <span className={PAYMENT_STATUS_TONE[status]} data-testid="payment-status">
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

const columns: readonly Column<OrderRow>[] = [
  {
    key: 'orderNumber',
    header: 'Order #',
    render: (row) => (
      <span className="admin-tabular font-medium" data-testid="order-number">
        {row.orderNumber}
      </span>
    ),
  },
  {
    key: 'maskedEmail',
    header: 'Customer',
    render: (row) => (
      <span className="admin-tabular" data-testid="order-email">
        {row.maskedEmail}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <OrderStatusBadge status={row.status} />,
  },
  {
    key: 'paymentStatus',
    header: 'Payment',
    render: (row) => <PaymentStatusBadge status={row.paymentStatus} />,
  },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    render: (row) => (
      <span className="admin-tabular" data-testid="order-total">
        {formatPaise(row.total)}
      </span>
    ),
  },
  {
    key: 'courierName',
    header: 'Courier',
    render: (row) =>
      row.courierName !== null ? (
        <span className="text-sm">{row.courierName}</span>
      ) : (
        <span className="admin-muted">—</span>
      ),
  },
  { key: 'createdAt', header: 'Placed', render: (row) => formatDateTime(row.createdAt) },
];

export function OrderTable({ rows, pagination, filters }: OrderTableProps) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/orders${buildQuery({ ...filters, q: q.trim(), page: 1 })}`);
  };

  return (
    <>
      <form
        onSubmit={submit}
        className="admin-filter-bar"
        aria-label="Order search"
        role="search"
      >
        <FormField id="order-q" label="Search" help="order number or customer email">
          {(control) => (
            <input
              {...control}
              type="search"
              className="admin-input"
              placeholder="e.g. PE-1001 or priya@"
              autoComplete="off"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              data-testid="order-search"
            />
          )}
        </FormField>
        <div className="admin-row-actions">
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            data-testid="order-search-submit"
          >
            Search
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              setQ('');
              router.push('/admin/orders');
            }}
          >
            Clear
          </button>
        </div>
      </form>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Orders, newest first"
        pagination={pagination}
        onChange={({ page }) => router.push(`/admin/orders${buildQuery({ ...filters, page })}`)}
        onRowActivate={(row) => router.push(`/admin/orders/${row.id}`)}
        emptyTitle="No orders match"
        emptyDescription="Search by the start of an order number or a customer email."
        rowTestId="order-row"
      />
    </>
  );
}
