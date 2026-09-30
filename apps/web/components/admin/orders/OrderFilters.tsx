'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { OrderFilterValues } from '@/lib/admin/filter-keys';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/admin/order-types';
import { buildQuery } from '@/lib/admin/query';

import { FormField } from '../FormField';

interface OrderFiltersProps {
  readonly filters: OrderFilterValues;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All payments' },
  ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export function OrderFilters({ filters }: OrderFiltersProps) {
  const router = useRouter();
  const [status, setStatus] = useState(filters.status ?? '');
  const [paymentStatus, setPaymentStatus] = useState(filters.paymentStatus ?? '');
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');

  const apply = (event: FormEvent) => {
    event.preventDefault();
    router.push(
      `/admin/orders${buildQuery({
        q: filters.q,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 1,
      })}`,
    );
  };

  const reset = () => {
    setStatus('');
    setPaymentStatus('');
    setFrom('');
    setTo('');
    router.push('/admin/orders');
  };

  return (
    <form onSubmit={apply} className="admin-filter-bar" aria-label="Order filters">
      <FormField id="order-status" label="Status">
        {(control) => (
          <select
            {...control}
            className="admin-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            data-testid="order-status-filter"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id="order-payment" label="Payment">
        {(control) => (
          <select
            {...control}
            className="admin-select"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            data-testid="order-payment-filter"
          >
            {PAYMENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id="order-from" label="From">
        {(control) => (
          <input
            {...control}
            type="date"
            className="admin-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="order-from-filter"
          />
        )}
      </FormField>
      <FormField id="order-to" label="To">
        {(control) => (
          <input
            {...control}
            type="date"
            className="admin-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="order-to-filter"
          />
        )}
      </FormField>
      <div className="admin-row-actions">
        <button type="submit" className="admin-btn admin-btn-primary">
          Apply
        </button>
        <button type="button" className="admin-btn" onClick={reset}>
          Reset
        </button>
      </div>
    </form>
  );
}
