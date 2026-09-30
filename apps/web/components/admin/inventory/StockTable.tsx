'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AdminCategoryNode, StockRow } from '@/lib/admin/catalogue-types';
import { formatCount, formatDateTime } from '@/lib/admin/format';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import { AdjustDialog } from './AdjustDialog';
import { type StockFilterValues, StockFilters } from './StockFilters';

interface StockTableProps {
  readonly rows: readonly StockRow[];
  readonly pagination: PaginationState;
  readonly filters: StockFilterValues;
  readonly categories: readonly AdminCategoryNode[];
  readonly role: AdminRole;
}

const stockCell = (row: StockRow) => (
  <span className="admin-tabular">
    {formatCount(row.stock)}
    {row.isLow && (
      <span className="admin-badge admin-badge-warning" data-testid="low-badge">
        {row.stock === 0 ? 'Out' : 'Low'}
      </span>
    )}
  </span>
);

/** Stock by variant with a delta-only adjustment dialog (P06 task 10). */
export function StockTable({
  rows: initial,
  pagination,
  filters,
  categories,
  role,
}: StockTableProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [target, setTarget] = useState<StockRow | null>(null);
  // Local copy so an adjustment shows immediately; server props replace it after `router.refresh()`.
  const [rows, setRows] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setRows(initial);
  }

  const columns: readonly Column<StockRow>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => <Link href={`/admin/products/${row.productId}`}>{row.productName}</Link>,
    },
    { key: 'sku', header: 'SKU', render: (row) => <code className="admin-mono">{row.sku}</code> },
    { key: 'label', header: 'Variant' },
    { key: 'stock', header: 'Stock', align: 'end', render: stockCell },
    {
      key: 'lowStockThreshold',
      header: 'Threshold',
      align: 'end',
      render: (row) => formatCount(row.lowStockThreshold),
    },
    {
      key: 'lastMovementAt',
      header: 'Last movement',
      render: (row) => formatDateTime(row.lastMovementAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <button
          type="button"
          className="admin-btn admin-btn-small"
          onClick={() => setTarget(row)}
          data-testid={`adjust-${row.sku}`}
        >
          Adjust
        </button>
      ),
    },
  ];

  return (
    <>
      <StockFilters initial={filters} categories={categories} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.variantId}
        caption="Stock by variant"
        pagination={pagination}
        onChange={(query) =>
          router.push(`/admin/inventory${buildQuery({ ...filters, page: query.page })}`)
        }
        emptyTitle="No variants match"
        emptyDescription="Try clearing the filters."
        rowTestId="stock-row"
      />
      <AdjustDialog
        row={target}
        role={role}
        onClose={() => setTarget(null)}
        onAdjusted={(row, result) => {
          setTarget(null);
          setRows(
            rows.map((entry) =>
              entry.variantId === row.variantId
                ? {
                    ...entry,
                    stock: result.stock,
                    isLow: result.stock <= entry.lowStockThreshold,
                    lastMovementAt: new Date().toISOString(),
                  }
                : entry,
            ),
          );
          notify(`${row.sku}: stock is now ${formatCount(result.stock)}`, 'success');
          router.refresh();
        }}
      />
    </>
  );
}
