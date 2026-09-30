'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { CustomerRow } from '@/lib/admin/customer-types';
import { DELETED_USER_LABEL } from '@/lib/admin/customer-types';
import type { CustomerFilterValues } from '@/lib/admin/filter-keys';
import { formatCount, formatDateTime } from '@/lib/admin/format';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';
import { FormField } from '../FormField';

export { CUSTOMER_FILTER_KEYS, type CustomerFilterValues } from '@/lib/admin/filter-keys';

interface CustomerTableProps {
  readonly rows: readonly CustomerRow[];
  readonly pagination: PaginationState;
  readonly filters: CustomerFilterValues;
}

export const SEARCH_HINT = 'email, phone or order no.';

/** Active / Disabled / Deleted, in that precedence; deleted accounts are anonymised, not gone. */
export function CustomerStatus({
  row,
}: {
  readonly row: Pick<CustomerRow, 'isDisabled' | 'deleted'>;
}) {
  const label = row.deleted ? 'Deleted' : row.isDisabled ? 'Disabled' : 'Active';
  const tone = row.deleted
    ? 'admin-badge'
    : row.isDisabled
      ? 'admin-badge admin-badge-critical'
      : 'admin-badge admin-badge-success';
  return (
    <span className={tone} data-testid="customer-status">
      {label}
    </span>
  );
}

const columns: readonly Column<CustomerRow>[] = [
  {
    key: 'maskedEmail',
    header: 'Email',
    render: (row) => (
      <span className="admin-tabular" data-testid="customer-masked-email">
        {row.maskedEmail}
      </span>
    ),
  },
  {
    key: 'maskedPhone',
    header: 'Phone',
    render: (row) => (
      <span className="admin-tabular" data-testid="customer-masked-phone">
        {row.maskedPhone ?? '—'}
      </span>
    ),
  },
  {
    key: 'maskedName',
    header: 'Name',
    render: (row) => (row.deleted ? DELETED_USER_LABEL : (row.maskedName ?? '—')),
  },
  {
    key: 'orderCount',
    header: 'Orders',
    align: 'end',
    render: (row) => formatCount(row.orderCount),
  },
  { key: 'createdAt', header: 'Joined', render: (row) => formatDateTime(row.createdAt) },
  { key: 'status', header: 'Status', render: (row) => <CustomerStatus row={row} /> },
];

/** Search lives in the URL (`q`, `page`) so a view can be shared; rows open the masked profile. */
export function CustomerTable({ rows, pagination, filters }: CustomerTableProps) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/customers${buildQuery({ q: q.trim(), page: 1 })}`);
  };

  return (
    <>
      <form
        onSubmit={submit}
        className="admin-filter-bar admin-customer-search"
        aria-label="Customer search"
        role="search"
      >
        <FormField id="customer-q" label="Search" help={SEARCH_HINT}>
          {(control) => (
            <input
              {...control}
              type="search"
              className="admin-input"
              placeholder="e.g. priya@, 9876543210 or PE-1001"
              autoComplete="off"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              data-testid="customer-search"
            />
          )}
        </FormField>
        <div className="admin-row-actions">
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            data-testid="customer-search-submit"
          >
            Search
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              setQ('');
              router.push('/admin/customers');
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
        caption="Customers, newest first"
        pagination={pagination}
        onChange={({ page }) => router.push(`/admin/customers${buildQuery({ ...filters, page })}`)}
        onRowActivate={(row) => router.push(`/admin/customers/${row.id}`)}
        emptyTitle="No customers match"
        emptyDescription="Search by the start of an email, a 10-digit phone number or an order number."
        rowTestId="customer-row"
      />
    </>
  );
}
