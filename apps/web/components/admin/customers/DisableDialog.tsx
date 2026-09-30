'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import {
  type CustomerDetailDto,
  type CustomerMutation,
  REASON_MAX,
  REASON_MIN,
} from '@/lib/admin/customer-types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';

interface DisableDialogProps {
  readonly customer: CustomerDetailDto;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDisabled: (customer: CustomerDetailDto) => void;
}

export const CANCELLED_MESSAGE = 'Confirmation was cancelled; the account is still active.';

/** `POST /admin/customers/:id/disable` (ADMIN ⚡): revokes every session; OTP login then fails generically. */
export function DisableDialog({ customer, open, onClose, onDisabled }: DisableDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < REASON_MIN;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reasonTooShort || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await adminApi.post<CustomerMutation>(
        `/admin/customers/${customer.id}/disable`,
        { reason: trimmed },
      );
      onDisabled(data.customer);
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not disable the account. Try again.');
      else setError(caught.code === 'STEP_UP_REQUIRED' ? CANCELLED_MESSAGE : caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} titleId="disable-title" onClose={onClose} size="sm" testId="disable-dialog">
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body" noValidate>
        <h2 id="disable-title" className="admin-dialog-title">
          Disable {customer.maskedEmail}?
        </h2>
        <p className="admin-dialog-text admin-muted">
          Every device is signed out and new sign-in codes stop working, without telling the
          customer why. You can enable the account again at any time.
        </p>
        <FormField
          id="disable-reason"
          label="Reason"
          help={`At least ${REASON_MIN} characters; recorded in the audit log.`}
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
              data-testid="disable-reason"
            />
          )}
        </FormField>
        {error !== null && (
          <p role="alert" className="admin-error" data-testid="disable-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-danger"
            disabled={busy || reasonTooShort}
            data-testid="disable-submit"
          >
            {busy ? 'Disabling…' : 'Disable account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
