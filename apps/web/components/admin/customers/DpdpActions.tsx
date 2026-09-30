'use client';

import { type FormEvent, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import {
  type CustomerDetailDto,
  ERASE_BLOCKED_CODE,
  type EraseResult,
  REASON_MAX,
  REASON_MIN,
} from '@/lib/admin/customer-types';
import { formatCount } from '@/lib/admin/format';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

interface DpdpActionsProps {
  readonly customer: CustomerDetailDto;
  readonly role: AdminRole;
  readonly onErased: (result: EraseResult) => void;
}

export const EXPORT_QUEUED_MESSAGE = 'Export queued; the customer will receive an email';
export const CANCELLED_MESSAGE = 'Confirmation was cancelled; nothing was erased.';
export const BLOCKED_MESSAGE =
  'Erasure is blocked while orders are pending, confirmed or in transit: the customer would lose tracking and refunds. It becomes possible once they are delivered or cancelled.';
export const DELETED_MESSAGE = 'This account has already been erased.';

const activeOrdersMessage = (count: number): string =>
  `${formatCount(count)} active order${count === 1 ? '' : 's'} — ${BLOCKED_MESSAGE}`;

/** DPDP export (ADMIN) and erase (ADMIN ⚡, reason, blocked by active orders) — P08 tasks 6–7. */
export function DpdpActions({ customer, role, onErased }: DpdpActionsProps) {
  const { notify } = useToast();
  const [exporting, setExporting] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [erasing, setErasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleted = customer.deleted || customer.flags.deleted;
  const blocked = customer.flags.activeOrders > 0;
  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < REASON_MIN;

  const requestExport = async () => {
    setExporting(true);
    try {
      await adminApi.post(`/admin/customers/${customer.id}/dpdp-export`);
      notify(EXPORT_QUEUED_MESSAGE, 'success');
    } catch (caught) {
      notify(isAdminApiError(caught) ? caught.message : 'Could not queue the export', 'critical');
    } finally {
      setExporting(false);
    }
  };

  const erase = async (event: FormEvent) => {
    event.preventDefault();
    if (reasonTooShort || erasing) return;
    setErasing(true);
    setError(null);
    try {
      const { data } = await adminApi.post<EraseResult>(
        `/admin/customers/${customer.id}/dpdp-erase`,
        { reason: trimmed },
      );
      setEraseOpen(false);
      setReason('');
      notify(
        `Account erased; ${formatCount(data.retained.orders)} order record${data.retained.orders === 1 ? '' : 's'} retained for tax law`,
        'success',
      );
      onErased(data);
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not erase the account. Try again.');
      else if (caught.code === 'STEP_UP_REQUIRED') setError(CANCELLED_MESSAGE);
      else if (caught.code === ERASE_BLOCKED_CODE) setError(BLOCKED_MESSAGE);
      else setError(caught.message);
    } finally {
      setErasing(false);
    }
  };

  if (role !== 'ADMIN')
    return (
      <p className="admin-muted admin-form-status" data-testid="dpdp-staff-hint">
        Data export and erasure requests are handled by an admin.
      </p>
    );

  return (
    <div className="admin-dpdp" data-testid="dpdp-actions">
      <div className="admin-dpdp-action">
        <div>
          <p className="admin-dpdp-title">Export their data</p>
          <p className="admin-muted">
            Builds a JSON file of everything we hold and emails the customer a link that works for
            15 minutes.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn"
          onClick={() => void requestExport()}
          disabled={exporting || deleted}
          data-testid="customer-export"
        >
          {exporting ? 'Queueing…' : 'Send data export'}
        </button>
      </div>
      <div className="admin-dpdp-action">
        <div>
          <p className="admin-dpdp-title">Erase their account</p>
          <p className="admin-muted">
            Anonymises the profile, addresses, wishlist and review names and signs them out
            everywhere. Orders and invoices are kept for eight years as the law requires.
          </p>
          {(blocked || deleted) && (
            <p className="admin-error" data-testid="erase-blocked">
              {deleted ? DELETED_MESSAGE : activeOrdersMessage(customer.flags.activeOrders)}
            </p>
          )}
        </div>
        <button
          type="button"
          className="admin-btn admin-btn-danger"
          onClick={() => setEraseOpen(true)}
          disabled={blocked || deleted}
          data-testid="customer-erase-open"
        >
          Erase account
        </button>
      </div>
      <Dialog
        open={eraseOpen}
        titleId="erase-title"
        onClose={() => setEraseOpen(false)}
        size="sm"
        testId="erase-dialog"
      >
        <form onSubmit={(event) => void erase(event)} className="admin-dialog-body" noValidate>
          <h2 id="erase-title" className="admin-dialog-title">
            Erase {customer.maskedEmail}?
          </h2>
          <p className="admin-dialog-text admin-muted">
            This cannot be undone. The customer will no longer be able to sign in, and their
            personal details are removed from order records while the financial rows stay.
          </p>
          <FormField
            id="erase-reason"
            label="Reason"
            help={`At least ${REASON_MIN} characters, e.g. the request reference.`}
            error={reason.length > 0 && reasonTooShort ? 'Add a slightly longer reason.' : null}
          >
            {(control) => (
              <textarea
                {...control}
                className="admin-textarea"
                rows={2}
                maxLength={REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-autofocus
                data-testid="erase-reason"
              />
            )}
          </FormField>
          {error !== null && (
            <p role="alert" className="admin-error" data-testid="erase-error">
              {error}
            </p>
          )}
          <div className="admin-dialog-actions">
            <button
              type="button"
              className="admin-btn"
              onClick={() => setEraseOpen(false)}
              disabled={erasing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-danger"
              disabled={erasing || reasonTooShort}
              data-testid="erase-submit"
            >
              {erasing ? 'Erasing…' : 'Erase permanently'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
