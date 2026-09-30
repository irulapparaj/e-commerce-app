'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import {
  AUDIT_FILTER_KEYS,
  type AuditFilterKey,
  type AuditFilterValues,
} from '@/lib/admin/filter-keys';
import { buildQuery } from '@/lib/admin/query';
import { AUDIT_ACTIONS } from '@/lib/admin/types';

import { FormField } from '../FormField';

export {
  AUDIT_FILTER_KEYS,
  type AuditFilterKey,
  type AuditFilterValues,
} from '@/lib/admin/filter-keys';

interface AuditFiltersProps {
  readonly initial: AuditFilterValues;
}

const LABELS: Readonly<Record<AuditFilterKey, string>> = {
  actorId: 'Actor ID',
  entityType: 'Entity type',
  entityId: 'Entity ID',
  action: 'Action',
  from: 'From',
  to: 'To',
};

/** Filters live in the URL so a view can be shared; submitting resets to page 1. */
export function AuditFilters({ initial }: AuditFiltersProps) {
  const router = useRouter();
  const [values, setValues] = useState<AuditFilterValues>(initial);
  const set = (key: AuditFilterKey, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const apply = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/audit${buildQuery({ ...values, page: 1 })}`);
  };

  const reset = () => {
    setValues({});
    router.push('/admin/audit');
  };

  return (
    <form
      onSubmit={apply}
      className="admin-filter-bar"
      aria-label="Audit filters"
      data-testid="audit-filters"
    >
      {AUDIT_FILTER_KEYS.map((key) => (
        <FormField key={key} id={`audit-${key}`} label={LABELS[key]}>
          {(control) => (
            <input
              {...control}
              type={key === 'from' || key === 'to' ? 'date' : 'text'}
              className="admin-input admin-input-small"
              value={values[key] ?? ''}
              onChange={(event) => set(key, event.target.value)}
              list={key === 'action' ? 'audit-actions' : undefined}
              data-testid={`audit-filter-${key}`}
            />
          )}
        </FormField>
      ))}
      <datalist id="audit-actions">
        {AUDIT_ACTIONS.map((action) => (
          <option key={action} value={action} />
        ))}
      </datalist>
      <div className="admin-row-actions">
        <button type="submit" className="admin-btn admin-btn-primary" data-testid="audit-apply">
          Apply
        </button>
        <button type="button" className="admin-btn" onClick={reset}>
          Clear
        </button>
      </div>
    </form>
  );
}
