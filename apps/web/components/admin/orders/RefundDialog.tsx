'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { toPaise } from '@/lib/admin/format';
import type { RefundResult } from '@/lib/admin/order-types';
import { REASON_MAX, REASON_MIN } from '@/lib/admin/order-types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { useToast } from '../Toast';

interface RefundDialogProps {
  readonly orderId: string;
  readonly maxTotal: number;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

const PAISE_PER_RUPEE = 100;

export function RefundDialog({ orderId, maxTotal, open, onClose, onSuccess }: RefundDialogProps) {
  const { notify } = useToast();
  const maxRupees = maxTotal / PAISE_PER_RUPEE;
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const validate = (): boolean => {
    let valid = true;
    const parsed = parseFloat(amountRupees);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount greater than zero.');
      valid = false;
    } else if (toPaise(parsed) > maxTotal) {
      setAmountError(`Amount cannot exceed ₹${maxRupees.toFixed(2)}.`);
      valid = false;
    } else {
      setAmountError(null);
    }
    if (reason.trim().length < REASON_MIN) {
      setReasonError(`Reason must be at least ${REASON_MIN} characters.`);
      valid = false;
    } else {
      setReasonError(null);
    }
    return valid;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      await adminApi.post<RefundResult>(`/admin/orders/${orderId}/refund`, {
        amountPaise: toPaise(parseFloat(amountRupees)),
        reason: reason.trim(),
      });
      notify('Refund initiated — will be confirmed by webhook', 'success');
      onSuccess();
    } catch (err) {
      notify(isAdminApiError(err) ? err.message : 'Could not initiate refund', 'critical');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setAmountRupees('');
    setReason('');
    setAmountError(null);
    setReasonError(null);
    onClose();
  };

  return (
    <Dialog open={open} titleId="refund-dialog-title" onClose={handleClose}>
      <div className="admin-dialog-body">
        <h2 id="refund-dialog-title" className="admin-dialog-title">
          Initiate Refund
        </h2>
        <p className="admin-dialog-text admin-muted">
          The refund is initiated asynchronously via Razorpay. The order status moves to{' '}
          <strong>Refunded</strong> only after the webhook confirms.
        </p>
        <FormField
          id="refund-amount"
          label={`Amount (₹, max ₹${maxRupees.toFixed(2)})`}
          error={amountError}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              className="admin-input"
              min="1"
              max={maxRupees}
              step="0.01"
              placeholder="0.00"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              data-testid="refund-amount"
            />
          )}
        </FormField>
        <FormField id="refund-reason" label="Reason" error={reasonError}>
          {(control) => (
            <textarea
              {...control}
              className="admin-input"
              rows={3}
              maxLength={REASON_MAX}
              placeholder="Reason for refund…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="refund-reason"
            />
          )}
        </FormField>
        <div className="admin-dialog-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={handleClose}
            disabled={busy}
            data-autofocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={submit}
            disabled={busy}
            data-testid="refund-confirm"
          >
            {busy ? 'Submitting…' : 'Initiate Refund'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
