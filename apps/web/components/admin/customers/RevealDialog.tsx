'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import {
  type CustomerDetailDto,
  type PiiDto,
  REASON_MAX,
  REASON_MIN,
  REVEAL_EXPIRED_CODE,
  type RevealResult,
} from '@/lib/admin/customer-types';
import { formatCountdown, secondsUntil } from '@/lib/admin/format';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';

interface RevealDialogProps {
  readonly customer: CustomerDetailDto;
  readonly open: boolean;
  readonly onClose: () => void;
}

interface Revealed {
  readonly pii: PiiDto;
  /** Epoch milliseconds; the countdown is driven by the server's `expiresAt`. */
  readonly expiresAtMs: number;
}

export const REVEAL_TOKEN_HEADER = 'X-Reveal-Token';
export const CANCELLED_MESSAGE = 'Confirmation was cancelled; nothing was revealed.';
export const EXPIRED_MESSAGE =
  'The reveal window closed and the values are masked again. Enter a new reason to reveal them once more.';
const TICK_MS = 1000;
const MS_PER_SECOND = 1000;

const remainingSeconds = (revealed: Revealed | null, nowMs: number): number =>
  revealed === null ? 0 : secondsUntil(revealed.expiresAtMs / MS_PER_SECOND, nowMs);

/**
 * Reason → `POST …/reveal` (ADMIN ⚡) → `GET …/pii` with the token. The plain values live only in
 * this dialog's state and are dropped when the server's expiry passes; a second look needs a new
 * reason because the token is single-window and the audit log records each one.
 */
export function RevealDialog({ customer, open, onClose }: RevealDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [remaining, setRemaining] = useState(0);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < REASON_MIN;

  // When the reveal window expires the RevealedValues subtree unmounts, dropping focus to body.
  // Re-focus the reason textarea so keyboard events (Escape) still reach the dialog panel.
  useEffect(() => {
    if (open && revealed === null && notice !== null) {
      reasonRef.current?.focus();
    }
  }, [open, revealed, notice]);

  useEffect(() => {
    if (revealed === null) return undefined;
    setRemaining(remainingSeconds(revealed, Date.now()));
    const timer = window.setInterval(() => {
      const left = remainingSeconds(revealed, Date.now());
      setRemaining(left);
      if (left > 0) return;
      // Expiry: discard the values and the token; the next reveal starts from a blank reason.
      setRevealed(null);
      setReason('');
      setNotice(EXPIRED_MESSAGE);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [revealed]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reasonTooShort || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data: grant } = await adminApi.post<RevealResult>(
        `/admin/customers/${customer.id}/reveal`,
        { reason: trimmed },
      );
      const { data: pii } = await adminApi.get<PiiDto>(`/admin/customers/${customer.id}/pii`, {
        headers: { [REVEAL_TOKEN_HEADER]: grant.revealToken },
      });
      setRevealed({ pii, expiresAtMs: new Date(grant.expiresAt).getTime() });
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not reveal the contact details. Try again.');
      else if (caught.code === 'STEP_UP_REQUIRED') setError(CANCELLED_MESSAGE);
      else if (caught.code === REVEAL_EXPIRED_CODE) setError(EXPIRED_MESSAGE);
      else setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setRevealed(null);
    setReason('');
    setError(null);
    setNotice(null);
    onClose();
  };

  return (
    <Dialog open={open} titleId="reveal-title" onClose={close} testId="reveal-dialog">
      <div className="admin-dialog-body">
        <h2 id="reveal-title" className="admin-dialog-title">
          Reveal contact details
        </h2>
        {revealed === null ? (
          <form onSubmit={(event) => void submit(event)} noValidate>
            <p className="admin-muted">
              The values stay visible for a short window, then mask themselves again. Your reason
              and every read are written to the audit log against {customer.maskedEmail}.
            </p>
            {notice !== null && (
              <p className="admin-hint-block" role="status" data-testid="reveal-notice">
                {notice}
              </p>
            )}
            <FormField
              id="reveal-reason"
              label="Reason"
              help={`At least ${REASON_MIN} characters, e.g. the support ticket or order number.`}
              error={reason.length > 0 && reasonTooShort ? 'Add a slightly longer reason.' : null}
            >
              {(control) => (
                <textarea
                  {...control}
                  ref={reasonRef}
                  className="admin-textarea"
                  rows={2}
                  maxLength={REASON_MAX}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  data-autofocus
                  data-testid="reveal-reason"
                />
              )}
            </FormField>
            {error !== null && (
              <p role="alert" className="admin-error" data-testid="reveal-error">
                {error}
              </p>
            )}
            <div className="admin-dialog-actions">
              <button type="button" className="admin-btn" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={busy || reasonTooShort}
                data-testid="reveal-submit"
              >
                {busy ? 'Revealing…' : 'Reveal'}
              </button>
            </div>
          </form>
        ) : (
          <RevealedValues pii={revealed.pii} remaining={remaining} onClose={close} />
        )}
      </div>
    </Dialog>
  );
}

interface RevealedValuesProps {
  readonly pii: PiiDto;
  readonly remaining: number;
  readonly onClose: () => void;
}

function RevealedValues({ pii, remaining, onClose }: RevealedValuesProps) {
  return (
    <>
      <p className="admin-reveal-countdown" role="status" aria-live="polite">
        Masks again in{' '}
        <span className="admin-tabular" data-testid="reveal-countdown">
          {formatCountdown(remaining)}
        </span>
      </p>
      <dl className="admin-pii-list" data-testid="customer-pii">
        <div>
          <dt>Name</dt>
          <dd data-testid="customer-pii-name">{pii.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd className="admin-tabular" data-testid="customer-pii-email">
            {pii.email}
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd className="admin-tabular" data-testid="customer-pii-phone">
            {pii.phone ?? '—'}
          </dd>
        </div>
      </dl>
      {pii.addresses.length > 0 && (
        <ul className="admin-address-list" aria-label="Addresses">
          {pii.addresses.map((address) => (
            <li key={address.id} className="admin-address-card" data-testid="customer-pii-address">
              <strong>{address.name}</strong>
              <span>{address.line1}</span>
              {address.line2 !== null && <span>{address.line2}</span>}
              <span>
                {address.city}, {address.state} {address.pincode}
              </span>
              <span className="admin-tabular">{address.phone}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-dialog-actions">
        <button type="button" className="admin-btn" onClick={onClose} data-autofocus>
          Close
        </button>
      </div>
    </>
  );
}
