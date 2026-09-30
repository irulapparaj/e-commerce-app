'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatDateTime, truncate } from '@/lib/admin/format';
import { buildQuery } from '@/lib/admin/query';
import type { AuditRow } from '@/lib/admin/types';

import { type Column, DataTable, type PaginationState } from '../DataTable';

import { AuditDetail } from './AuditDetail';
import type { AuditFilterValues } from './AuditFilters';

interface AuditTableProps {
  readonly rows: readonly AuditRow[];
  readonly pagination: PaginationState;
  readonly filters: AuditFilterValues;
}

const ENTITY_ID_MAX = 14;

const columns: readonly Column<AuditRow>[] = [
  { key: 'createdAt', header: 'When', render: (row) => formatDateTime(row.createdAt) },
  {
    key: 'actor',
    header: 'Actor',
    render: (row) => (row.actor === null ? 'system' : row.actor.email),
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => <code className="admin-mono">{row.action}</code>,
  },
  { key: 'entityType', header: 'Entity' },
  {
    key: 'entityId',
    header: 'Entity ID',
    render: (row) =>
      row.entityId === null ? (
        '—'
      ) : (
        <span className="admin-mono" title={row.entityId}>
          {truncate(row.entityId, ENTITY_ID_MAX)}
        </span>
      ),
  },
  { key: 'ip', header: 'IP' },
];

export function AuditTable({ rows, pagination, filters }: AuditTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<AuditRow | null>(null);

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Audit log entries, newest first"
        pagination={pagination}
        onChange={({ page }) => router.push(`/admin/audit${buildQuery({ ...filters, page })}`)}
        onRowActivate={setSelected}
        emptyTitle="No audit entries match"
        emptyDescription="Widen the filters or clear them."
        rowTestId="audit-row"
      />
      <AuditDetail row={selected} onClose={() => setSelected(null)} />
    </>
  );
}
