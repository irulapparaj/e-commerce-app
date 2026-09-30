'use client';

import { useRouter } from 'next/navigation';

import type { MovementRow } from '@/lib/admin/catalogue-types';
import { formatDateTime, formatDelta, truncate } from '@/lib/admin/format';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';

import { type LedgerFilterValues, LedgerFilters } from './LedgerFilters';

interface LedgerTableProps {
  readonly rows: readonly MovementRow[];
  readonly pagination: PaginationState;
  readonly filters: LedgerFilterValues;
}

const REFERENCE_MAX = 14;

const columns: readonly Column<MovementRow>[] = [
  { key: 'createdAt', header: 'When', render: (row) => formatDateTime(row.createdAt) },
  {
    key: 'product',
    header: 'Product',
    render: (row) => (
      <>
        {row.productName} <span className="admin-muted">· {row.label}</span>
      </>
    ),
  },
  { key: 'sku', header: 'SKU', render: (row) => <code className="admin-mono">{row.sku}</code> },
  {
    key: 'delta',
    header: 'Change',
    align: 'end',
    render: (row) => (
      <span className="admin-tabular" data-testid="ledger-delta">
        {formatDelta(row.delta)}
      </span>
    ),
  },
  {
    key: 'reason',
    header: 'Reason',
    render: (row) => <code className="admin-mono">{row.reason}</code>,
  },
  {
    key: 'actor',
    header: 'By',
    render: (row) => (row.actor === null ? 'system' : row.actor.email),
  },
  { key: 'note', header: 'Note', render: (row) => row.note ?? '—' },
  {
    key: 'referenceId',
    header: 'Reference',
    render: (row) =>
      row.referenceId === null ? (
        '—'
      ) : (
        <span className="admin-mono" title={row.referenceId}>
          {truncate(row.referenceId, REFERENCE_MAX)}
        </span>
      ),
  },
];

/** Append-only movement ledger; export lands with P07. */
export function LedgerTable({ rows, pagination, filters }: LedgerTableProps) {
  const router = useRouter();
  return (
    <>
      <LedgerFilters initial={filters} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Stock movements"
        pagination={pagination}
        onChange={(query) =>
          router.push(`/admin/inventory/movements${buildQuery({ ...filters, page: query.page })}`)
        }
        emptyTitle="No movements match"
        rowTestId="ledger-row"
      />
    </>
  );
}
