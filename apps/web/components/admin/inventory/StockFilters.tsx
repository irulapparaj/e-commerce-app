'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';
import type { StockFilterValues } from '@/lib/admin/filter-keys';
import { buildQuery } from '@/lib/admin/query';

import { FormField } from '../FormField';

export { STOCK_FILTER_KEYS, type StockFilterValues } from '@/lib/admin/filter-keys';

interface StockFiltersProps {
  readonly initial: StockFilterValues;
  readonly categories: readonly AdminCategoryNode[];
}

/** Search, category and "below threshold" live in the URL (the dashboard tile links straight here). */
export function StockFilters({ initial, categories }: StockFiltersProps) {
  const router = useRouter();
  const [values, setValues] = useState<StockFilterValues>(initial);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/inventory${buildQuery({ ...values, page: 1 })}`);
  };

  return (
    <form
      onSubmit={apply}
      className="admin-filter-bar"
      aria-label="Stock filters"
      data-testid="stock-filters"
    >
      <FormField id="stock-q" label="Search">
        {(control) => (
          <input
            {...control}
            type="search"
            className="admin-input admin-input-small"
            placeholder="SKU or product"
            value={values.q ?? ''}
            onChange={(event) => setValues({ ...values, q: event.target.value })}
            data-testid="stock-filter-q"
          />
        )}
      </FormField>
      <FormField id="stock-category" label="Category">
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
                <option value={root.id}>{root.name} (all)</option>
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
      <FormField id="stock-below" label="Below threshold only" inline>
        {(control) => (
          <input
            {...control}
            type="checkbox"
            checked={values.belowThreshold === 'true'}
            onChange={(event) =>
              setValues({ ...values, belowThreshold: event.target.checked ? 'true' : '' })
            }
            data-testid="stock-filter-below"
          />
        )}
      </FormField>
      <div className="admin-row-actions">
        <button type="submit" className="admin-btn admin-btn-primary" data-testid="stock-apply">
          Apply
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            setValues({});
            router.push('/admin/inventory');
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
