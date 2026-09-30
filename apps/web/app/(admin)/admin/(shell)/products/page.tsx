import type { Metadata } from 'next';

import { ProductsList } from '@/components/admin/catalogue/ProductsList';
import type { AdminCategoryNode, AdminProductRow } from '@/lib/admin/catalogue-types';
import { PRODUCT_FILTER_KEYS } from '@/lib/admin/filter-keys';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Products' };

const PAGE_LIMIT = 20;

interface ProductsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const filters = pickParams(params, PRODUCT_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const [products, categories] = await Promise.all([
    adminServerGet<readonly AdminProductRow[]>(
      `/admin/products${buildQuery({ ...filters, page, limit: PAGE_LIMIT })}`,
    ),
    adminServerGet<readonly AdminCategoryNode[]>('/admin/categories'),
  ]);
  if (!products.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load products ({products.code}).
      </p>
    );
  return (
    <ProductsList
      rows={products.data}
      pagination={products.meta ?? { page, limit: PAGE_LIMIT, total: products.data.length }}
      filters={filters}
      categories={categories.ok ? categories.data : []}
    />
  );
}
