// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminProductRow } from '@/lib/admin/catalogue-types';
import { formatPaise } from '@/lib/admin/format';
import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { categoryTree, product } from '@/test-utils/catalogue';

import { ToastProvider } from '../Toast';

import { ProductCreate } from './ProductCreate';
import { ProductEditor } from './ProductEditor';
import { ProductsList } from './ProductsList';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/products' };
});

const row: AdminProductRow = {
  id: product.id,
  name: product.name,
  slug: product.slug,
  sku: product.sku,
  isActive: true,
  isFeatured: true,
  category: { id: 'c', name: 'Premium', slug: 'agarbatti-premium' },
  variants: product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    label: v.label,
    price: v.price,
    stock: v.stock,
    lowStockThreshold: v.lowStockThreshold,
  })),
  imageCount: 2,
  thumbUrl: 'https://cdn.test/t.webp',
  updatedAt: product.updatedAt,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ProductsList', () => {
  it('renders rows with status and lowest price, navigates on activation and pushes filters', async () => {
    const user = userEvent.setup();
    render(
      <ProductsList
        rows={[
          row,
          {
            ...row,
            id: 'p2',
            sku: 'DRAFT',
            isActive: false,
            isFeatured: false,
            thumbUrl: null,
            variants: [],
          },
        ]}
        pagination={{ page: 1, limit: 20, total: 2 }}
        filters={{}}
        categories={categoryTree}
      />,
    );

    expect(screen.getAllByTestId('product-status').map((el) => el.textContent)).toEqual([
      'Published · Featured',
      'Draft',
    ]);
    expect(screen.getAllByTestId('product-row')[0]).toHaveTextContent(formatPaise(19900));
    await user.click(screen.getAllByTestId('product-row')[1]!);
    expect(routerMock.push).toHaveBeenCalledWith('/admin/products/p2');
    await user.selectOptions(screen.getByTestId('product-filter-status'), 'inactive');
    await user.click(screen.getByTestId('product-filters-apply'));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/products?status=inactive&page=1');
    expect(screen.getByTestId('product-new')).toHaveAttribute('href', '/admin/products/new');
  });
});

describe('ProductCreate', () => {
  it('creates a draft and navigates to the editor', async () => {
    stubFetch(() => okEnvelope(product));
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProductCreate categories={categoryTree} role="STAFF" />
      </ToastProvider>,
    );

    await user.type(screen.getByTestId('product-name'), 'Rose Agarbatti');
    await user.type(screen.getByTestId('product-sku'), 'ROSE');
    await user.selectOptions(screen.getByTestId('product-category'), product.categoryId);
    await user.click(screen.getByTestId('product-save'));

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith(`/admin/products/${product.id}`),
    );
  });
});

describe('ProductEditor', () => {
  it('shows every section, disables delete for ordered products and hides the danger zone for STAFF', () => {
    const { unmount } = render(
      <ToastProvider>
        <ProductEditor
          product={{ ...product, everOrdered: true }}
          categories={categoryTree}
          role="ADMIN"
        />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Variants' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Images (2)' })).toBeInTheDocument();
    expect(screen.getByTestId('product-delete')).toBeDisabled();
    expect(
      screen.getByText('Ordered products cannot be deleted; unpublish instead.'),
    ).toBeInTheDocument();
    unmount();
    render(
      <ToastProvider>
        <ProductEditor product={product} categories={categoryTree} role="STAFF" />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('product-delete')).toBeNull();
  });

  it('deletes after confirmation and reports API refusals', async () => {
    const calls = stubFetch((call) =>
      call.method === 'DELETE'
        ? errorEnvelope(
            409,
            'CONFLICT',
            'Product has stock history; unpublish it instead of deleting',
          )
        : okEnvelope(product),
    );
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProductEditor product={product} categories={categoryTree} role="ADMIN" />
      </ToastProvider>,
    );

    await user.click(screen.getByTestId('product-delete'));
    await user.click(
      within(screen.getByTestId('product-delete-confirm')).getByRole('button', { name: 'Delete' }),
    );

    expect(
      await screen.findByText('Product has stock history; unpublish it instead of deleting'),
    ).toBeInTheDocument();
    expect(
      calls.some(
        (call) => call.method === 'DELETE' && call.url === `/api/v1/admin/products/${product.id}`,
      ),
    ).toBe(true);
    expect(routerMock.push).not.toHaveBeenCalledWith('/admin/products');
  });
});
