'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { AdminCategoryNode, AdminProductRow } from '@/lib/admin/catalogue-types';
import { formatDateTime, formatPaise } from '@/lib/admin/format';
import { buildQuery } from '@/lib/admin/query';

import { type Column, DataTable, type PaginationState } from '../DataTable';
import { PageHeader } from '../PageHeader';

import { type ProductFilterValues, ProductsFilters } from './ProductsFilters';

interface ProductsListProps {
  readonly rows: readonly AdminProductRow[];
  readonly pagination: PaginationState;
  readonly filters: ProductFilterValues;
  readonly categories: readonly AdminCategoryNode[];
}

const priceFrom = (row: AdminProductRow): string => {
  const prices = row.variants.map((variant) => variant.price);
  return prices.length === 0 ? '—' : formatPaise(Math.min(...prices));
};

const columns: readonly Column<AdminProductRow>[] = [
  {
    key: 'thumb',
    header: '',
    render: (row) =>
      row.thumbUrl === null ? (
        <span className="admin-tree-thumb admin-tree-thumb-empty" aria-hidden="true" />
      ) : (
        <img className="admin-tree-thumb" src={row.thumbUrl} alt="" width={40} height={40} />
      ),
  },
  {
    key: 'name',
    header: 'Product',
    render: (row) => (
      <>
        <Link href={`/admin/products/${row.id}`} data-testid={`product-link-${row.sku}`}>
          {row.name}
        </Link>
        <span className="admin-muted">
          {' '}
          · <code className="admin-mono">{row.sku}</code>
        </span>
      </>
    ),
  },
  { key: 'category', header: 'Category', render: (row) => row.category.name },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <span
        className={row.isActive ? 'admin-badge admin-badge-success' : 'admin-badge'}
        data-testid="product-status"
      >
        {row.isActive ? 'Published' : 'Draft'}
        {row.isFeatured ? ' · Featured' : ''}
      </span>
    ),
  },
  {
    key: 'variants',
    header: 'Variants',
    align: 'end',
    render: (row) => String(row.variants.length),
  },
  { key: 'price', header: 'From', align: 'end', render: priceFrom },
  { key: 'images', header: 'Images', align: 'end', render: (row) => String(row.imageCount) },
  { key: 'updatedAt', header: 'Updated', render: (row) => formatDateTime(row.updatedAt) },
];

export function ProductsList({ rows, pagination, filters, categories }: ProductsListProps) {
  const router = useRouter();
  return (
    <>
      <PageHeader
        title="Products"
        description="Drafts are invisible on the storefront until an admin publishes them."
        actions={
          <Link
            href="/admin/products/new"
            className="admin-btn admin-btn-primary"
            data-testid="product-new"
          >
            New product
          </Link>
        }
      />
      <ProductsFilters initial={filters} categories={categories} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Products"
        pagination={pagination}
        onChange={(query) =>
          router.push(`/admin/products${buildQuery({ ...filters, page: query.page })}`)
        }
        onRowActivate={(row) => router.push(`/admin/products/${row.id}`)}
        emptyTitle="No products match"
        emptyDescription="Create a product or clear the filters."
        rowTestId="product-row"
      />
    </>
  );
}
