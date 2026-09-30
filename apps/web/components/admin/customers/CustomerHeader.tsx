'use client';

import { type CustomerDetailDto, DELETED_USER_LABEL } from '@/lib/admin/customer-types';
import { formatCount, formatDateTime } from '@/lib/admin/format';

import type { AdminRole } from '../Nav.config';

import { CustomerStatus } from './CustomerTable';

interface CustomerHeaderProps {
  readonly customer: CustomerDetailDto;
  readonly role: AdminRole;
  readonly busy: boolean;
  readonly onReveal: () => void;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
}

export const STAFF_HINT = 'Reveal, disable and DPDP actions: Admin only.';

/** Masked contact, status chips and the ADMIN actions (DESIGN §11.3: PII masked by default). */
export function CustomerHeader({
  customer,
  role,
  busy,
  onReveal,
  onDisable,
  onEnable,
}: CustomerHeaderProps) {
  const deleted = customer.deleted || customer.flags.deleted;
  const name = deleted ? DELETED_USER_LABEL : (customer.maskedName ?? 'Customer');

  return (
    <header className="admin-page-header admin-customer-header">
      <div>
        <h1 id="page-title" className="admin-page-title" data-testid="customer-name">
          {name}
        </h1>
        <dl className="admin-customer-contact">
          <div>
            <dt>Email</dt>
            <dd className="admin-tabular" data-testid="customer-masked-email">
              {customer.maskedEmail}
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd className="admin-tabular" data-testid="customer-masked-phone">
              {customer.maskedPhone ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{formatDateTime(customer.createdAt)}</dd>
          </div>
          <div>
            <dt>Orders</dt>
            <dd className="admin-tabular">{formatCount(customer.orderCount)}</dd>
          </div>
          <div>
            <dt>Locale</dt>
            <dd>{customer.locale}</dd>
          </div>
        </dl>
        <p className="admin-chip-row">
          <CustomerStatus row={{ isDisabled: customer.isDisabled, deleted }} />
          {customer.flags.activeOrders > 0 && (
            <span className="admin-badge admin-badge-warning" data-testid="customer-active-orders">
              {formatCount(customer.flags.activeOrders)} active order
              {customer.flags.activeOrders === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </div>
      <div className="admin-page-actions admin-customer-actions">
        {role === 'ADMIN' ? (
          <>
            <button
              type="button"
              className="admin-btn"
              onClick={onReveal}
              disabled={busy || deleted}
              data-testid="customer-reveal-open"
            >
              Reveal contact
            </button>
            {customer.isDisabled ? (
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={onEnable}
                disabled={busy || deleted}
                data-testid="customer-enable"
              >
                {busy ? 'Working…' : 'Enable account'}
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={onDisable}
                disabled={busy || deleted}
                data-testid="customer-disable-open"
              >
                Disable account
              </button>
            )}
          </>
        ) : (
          <p className="admin-muted admin-form-status" data-testid="customer-staff-hint">
            {STAFF_HINT}
          </p>
        )}
      </div>
    </header>
  );
}
