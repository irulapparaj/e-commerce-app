'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { STOCK_REASONS } from '@/lib/admin/catalogue-types';
import { type LedgerFilterKey, type LedgerFilterValues } from '@/lib/admin/filter-keys';
import { buildQuery } from '@/lib/admin/query';

import { FormField } from '../FormField';

export { LEDGER_FILTER_KEYS, type LedgerFilterValues } from '@/lib/admin/filter-keys';

interface LedgerFiltersProps {
  readonly initial: LedgerFilterValues;
}

export function LedgerFilters({ initial }: LedgerFiltersProps) {
  const router = useRouter();
  const [values, setValues] = useState<LedgerFilterValues>(initial);
  const set = (key: LedgerFilterKey, value: string) => setValues({ ...values, [key]: value });

  const apply = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/inventory/movements${buildQuery({ ...values, page: 1 })}`);
  };

  return (
    <form
      onSubmit={apply}
      className="admin-filter-bar"
      aria-label="Ledger filters"
      data-testid="ledger-filters"
    >
      <FormField id="ledger-variant" label="Variant ID">
        {(control) => (
          <input
            {...control}
            type="text"
            className="admin-input admin-input-small admin-mono"
            value={values.variantId ?? ''}
            onChange={(event) => set('variantId', event.target.value)}
          />
        )}
      </FormField>
      <FormField id="ledger-reason" label="Reason">
        {(control) => (
          <select
            {...control}
            className="admin-select"
            value={values.reason ?? ''}
            onChange={(event) => set('reason', event.target.value)}
            data-testid="ledger-filter-reason"
          >
            <option value="">All</option>
            {STOCK_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id="ledger-from" label="From">
        {(control) => (
          <input
            {...control}
            type="date"
            className="admin-input admin-input-small"
            value={values.from ?? ''}
            onChange={(event) => set('from', event.target.value)}
          />
        )}
      </FormField>
      <FormField id="ledger-to" label="To">
        {(control) => (
          <input
            {...control}
            type="date"
            className="admin-input admin-input-small"
            value={values.to ?? ''}
            onChange={(event) => set('to', event.target.value)}
          />
        )}
      </FormField>
      <div className="admin-row-actions">
        <button type="submit" className="admin-btn admin-btn-primary" data-testid="ledger-apply">
          Apply
        </button>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            setValues({});
            router.push('/admin/inventory/movements');
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
