'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';
import type { ProductFilterValues } from '@/lib/admin/filter-keys';
import { buildQuery } from '@/lib/admin/query';

import { FormField } from '../FormField';

export { PRODUCT_FILTER_KEYS, type ProductFilterValues } from '@/lib/admin/filter-keys';

interface ProductsFiltersProps {
  readonly initial: ProductFilterValues;
  readonly categories: readonly AdminCategoryNode[];
}

export function ProductsFilters({ initial, categories }: ProductsFiltersProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFilterValues>(initial);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/products${buildQuery({ ...values, page: 1 })}`);
  };

  return (
    <form
      onSubmit={apply}
      className="admin-filter-bar"
      aria-label="Product filters"
      data-testid="product-filters"
    >
      <FormField id="products-q" label="Search">
        {(control) => (
          <input
            {...control}
            type="search"
            className="admin-input admin-input-small"
            placeholder="Name or SKU"
            value={values.q ?? ''}
            onChange={(event) => setValues({ ...values, q: event.target.value })}
            data-testid="product-filter-q"
          />
        )}
      </FormField>
      <FormField id="products-status" label="Status">
        {(control) => (
          <select
            {...control}
            className="admin-select"
            value={values.status ?? 'all'}
            onChange={(event) => setValues({ ...values, status: event.target.value })}
            data-testid="product-filter-status"
          >
            <option value="all">All</option>
            <option value="active">Published</option>
            <option value="inactive">Drafts</option>
          </select>
        )}
      </FormField>
      <FormField id="products-category" label="Category">
        {(control) => (
          <select
            {...control}
            className="admin-select"
            value={values.category ?? ''}
            onChange={(event) => setValues({ ...values, category: event.target.value })}
          >
            <option value="">All</option>
            {categories.map((root) => (
              <optgroup key={root.id} label={root.name}>
                <option value={root.id}>{root.name}</option>
                {root.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </FormField>
      <div className="admin-row-actions">
        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          data-testid="product-filters-apply"
        >
          Apply
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            setValues({});
            router.push('/admin/products');
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
