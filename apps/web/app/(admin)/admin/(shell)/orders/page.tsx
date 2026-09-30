import type { Metadata } from 'next';

import { OrderFilters } from '@/components/admin/orders/OrderFilters';
import { OrderTable } from '@/components/admin/orders/OrderTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { ORDER_FILTER_KEYS } from '@/lib/admin/filter-keys';
import type { OrderRow } from '@/lib/admin/order-types';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Orders' };

const PAGE_LIMIT = 20;

interface OrdersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const filters = pickParams(params, ORDER_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const orders = await adminServerGet<readonly OrderRow[]>(
    `/admin/orders${buildQuery({ ...filters, page, limit: PAGE_LIMIT })}`,
  );
  if (!orders.ok) {
    return (
      <p role="alert" className="admin-error">
        Could not load orders ({orders.code}).
      </p>
    );
  }
  return (
    <>
      <PageHeader
        title="Orders"
        description="All customer orders. Phone numbers are masked; use the detail view for full information."
      />
      <OrderFilters filters={filters} />
      <OrderTable
        rows={orders.data}
        pagination={orders.meta ?? { page, limit: PAGE_LIMIT, total: orders.data.length }}
        filters={filters}
      />
    </>
  );
}
