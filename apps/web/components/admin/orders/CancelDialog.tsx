'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { REASON_MAX, REASON_MIN } from '@/lib/admin/order-types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { useToast } from '../Toast';

interface CancelDialogProps {
  readonly orderId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function CancelDialog({ orderId, open, onClose, onSuccess }: CancelDialogProps) {
  const { notify } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const cancel = async () => {
    if (note.trim().length < REASON_MIN) {
      setFieldError(`Reason must be at least ${REASON_MIN} characters.`);
      return;
    }
    setBusy(true);
    setFieldError(null);
    try {
      await adminApi.post(`/admin/orders/${orderId}/cancel`, { note: note.trim() });
      notify('Order cancelled', 'success');
      onSuccess();
    } catch (err) {
      notify(isAdminApiError(err) ? err.message : 'Could not cancel order', 'critical');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setNote('');
    setFieldError(null);
    onClose();
  };

  return (
    <Dialog open={open} titleId="cancel-dialog-title" onClose={handleClose} size="sm">
      <div className="admin-dialog-body">
        <h2 id="cancel-dialog-title" className="admin-dialog-title">
          Cancel Order
        </h2>
        <p className="admin-dialog-text admin-muted">
          Cancelling will release reserved stock. This action requires step-up auth and cannot be
          undone after the order is DISPATCHED.
        </p>
        <FormField id="cancel-note" label="Reason" error={fieldError}>
          {(control) => (
            <textarea
              {...control}
              className="admin-input"
              rows={3}
              maxLength={REASON_MAX}
              placeholder="Reason for cancellation…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="cancel-note"
            />
          )}
        </FormField>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={handleClose} disabled={busy} data-autofocus>
            Back
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-danger"
            onClick={cancel}
            disabled={busy || note.trim().length < REASON_MIN}
            data-testid="cancel-confirm"
          >
            {busy ? 'Cancelling…' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
