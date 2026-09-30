'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { formatCount, formatDateTime } from '@/lib/admin/format';
import type { ImportJobDto, ImportStatus } from '@/lib/admin/import-types';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';

interface HistoryTableProps {
  readonly rows: readonly ImportJobDto[];
  readonly pagination: PaginationState;
}

const STATUS_CLASS: Readonly<Record<ImportStatus, string>> = {
  UPLOADED: 'admin-badge',
  VALIDATED: 'admin-badge admin-badge-success',
  APPLIED: 'admin-badge admin-badge-success',
  FAILED: 'admin-badge admin-badge-critical',
};

const fileKind = (contentType: string): string =>
  contentType === 'text/csv' ? 'CSV' : contentType.includes('spreadsheetml') ? 'XLSX' : contentType;

const summaryText = (row: ImportJobDto): string =>
  row.summary === null
    ? '—'
    : `${formatCount(row.summary.creates)} new · ${formatCount(row.summary.updates)} updated · ${formatCount(row.summary.stockDeltas)} stock`;

const columns: readonly Column<ImportJobDto>[] = [
  { key: 'createdAt', header: 'Uploaded', render: (row) => formatDateTime(row.createdAt) },
  { key: 'contentType', header: 'File', render: (row) => fileKind(row.contentType) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <span className={STATUS_CLASS[row.status]} data-testid="history-status">
        {row.status}
      </span>
    ),
  },
  {
    key: 'rows',
    header: 'Rows',
    align: 'end',
    render: (row) =>
      row.totalRows === 0
        ? '—'
        : `${formatCount(row.okRows)} ok${row.errorRows > 0 ? ` · ${formatCount(row.errorRows)} errors` : ''}`,
  },
  { key: 'summary', header: 'Summary', render: summaryText },
  { key: 'actor', header: 'By', render: (row) => row.actor.email },
  {
    key: 'open',
    header: '',
    render: (row) => (
      <Link
        href={`/admin/import/${row.id}`}
        className="admin-btn admin-btn-small"
        onClick={(event) => event.stopPropagation()}
        data-testid="import-history-open"
      >
        Open
      </Link>
    ),
  },
];

/** Newest first; a row opens its dry run / apply page. */
export function HistoryTable({ rows, pagination }: HistoryTableProps) {
  const router = useRouter();
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption="Import history, newest first"
      pagination={pagination}
      onChange={({ page }) => router.push(`/admin/import${buildQuery({ page })}`)}
      onRowActivate={(row) => router.push(`/admin/import/${row.id}`)}
      emptyTitle="No imports yet"
      emptyDescription="Upload a filled template to see its dry run here."
      rowTestId="import-history-row"
    />
  );
}
