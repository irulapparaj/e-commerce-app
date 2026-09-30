import type { Metadata } from 'next';
import Link from 'next/link';

import { LowStockList } from '@/components/admin/inventory/LowStockList';
import { StockTable } from '@/components/admin/inventory/StockTable';
import { PageHeader } from '@/components/admin/PageHeader';
import type { AdminCategoryNode, StockRow } from '@/lib/admin/catalogue-types';
import { STOCK_FILTER_KEYS } from '@/lib/admin/filter-keys';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Inventory' };

const PAGE_LIMIT = 25;

interface InventoryPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = await searchParams;
  const filters = pickParams(params, STOCK_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const [session, stock, lowStock, categories] = await Promise.all([
    getSession(),
    adminServerGet<readonly StockRow[]>(
      `/admin/inventory${buildQuery({ ...filters, page, limit: PAGE_LIMIT })}`,
    ),
    adminServerGet<readonly StockRow[]>('/admin/inventory/low-stock'),
    adminServerGet<readonly AdminCategoryNode[]>('/admin/categories'),
  ]);
  if (!stock.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load inventory ({stock.code}).
      </p>
    );
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock changes only through adjustments with a reason; every change lands in the ledger."
        actions={
          <Link
            href="/admin/inventory/movements"
            className="admin-btn"
            data-testid="inventory-ledger-link"
          >
            Movement ledger
          </Link>
        }
      />
      <div className="admin-editor-layout">
        <div>
          <StockTable
            rows={stock.data}
            pagination={stock.meta ?? { page, limit: PAGE_LIMIT, total: stock.data.length }}
            filters={filters}
            categories={categories.ok ? categories.data : []}
            role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
          />
        </div>
        <aside className="admin-editor-aside">
          <LowStockList rows={lowStock.ok ? lowStock.data : []} />
        </aside>
      </div>
    </>
  );
}
