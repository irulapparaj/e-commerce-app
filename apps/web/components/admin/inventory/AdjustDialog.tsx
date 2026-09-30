'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdjustResult, StockRow } from '@/lib/admin/catalogue-types';
import { formatCount } from '@/lib/admin/format';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import type { AdminRole } from '../Nav.config';

import { adjustmentState, NOTE_MIN, STAFF_LIMIT_HINT, STEP_UP_HINT } from './adjust';

interface AdjustDialogProps {
  readonly row: StockRow | null;
  readonly role: AdminRole;
  readonly onClose: () => void;
  readonly onAdjusted: (row: StockRow, result: AdjustResult) => void;
}

const CANCELLED = 'Confirmation was cancelled; stock was not changed.';

/** Delta + note only (P06 task 10). Absolute stock is never set from the UI (review note). */
export function AdjustDialog({ row, role, onClose, onAdjusted }: AdjustDialogProps) {
  const [deltaText, setDeltaText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDeltaText('');
    setNote('');
    setError(null);
  }, [row]);

  const state = adjustmentState(deltaText, note, row?.stock ?? 0, role);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (row === null || !state.canSubmit || state.delta === null) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await adminApi.post<AdjustResult>(
        `/admin/inventory/${row.variantId}/adjust`,
        {
          delta: state.delta,
          note: note.trim(),
        },
      );
      onAdjusted(row, data);
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not adjust stock. Try again.');
      else setError(caught.code === 'STEP_UP_REQUIRED' ? CANCELLED : caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={row !== null} titleId="adjust-title" onClose={onClose} testId="adjust-dialog">
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body" noValidate>
        <h2 id="adjust-title" className="admin-dialog-title">
          Adjust stock
        </h2>
        <p className="admin-dialog-text">
          {row?.productName} · {row?.label} · <code className="admin-mono">{row?.sku}</code>
        </p>
        <FormField
          id="adjust-delta"
          label="Change (units)"
          help="Negative numbers remove stock. Every change is written to the ledger with your name."
          error={state.wouldGoNegative ? 'Stock cannot go below zero.' : null}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              step={1}
              className="admin-input admin-tabular"
              value={deltaText}
              onChange={(event) => setDeltaText(event.target.value)}
              data-autofocus
              data-testid="adjust-delta"
            />
          )}
        </FormField>
        <p className="admin-preview" aria-live="polite" data-testid="adjust-preview">
          {row === null || state.previewStock === null
            ? 'Enter a change to preview the new stock.'
            : `${formatCount(row.stock)} → ${formatCount(state.previewStock)}`}
        </p>
        {state.needsStepUp && (
          <p className="admin-hint" data-testid="adjust-stepup-hint">
            {state.blockedForStaff ? STAFF_LIMIT_HINT : STEP_UP_HINT}
          </p>
        )}
        <FormField
          id="adjust-note"
          label="Reason"
          help={`At least ${NOTE_MIN} characters.`}
          error={note.length > 0 && state.noteTooShort ? 'Add a slightly longer reason.' : null}
        >
          {(control) => (
            <textarea
              {...control}
              className="admin-textarea"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              data-testid="adjust-note"
            />
          )}
        </FormField>
        {error !== null && (
          <p role="alert" className="admin-error" data-testid="adjust-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={busy || !state.canSubmit}
            data-testid="adjust-submit"
          >
            {busy ? 'Saving…' : 'Apply adjustment'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
