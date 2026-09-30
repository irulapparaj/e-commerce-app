'use client';

import { type FormEvent, useState } from 'react';

import { postJson } from '@/lib/auth/client';

import { Dialog } from './Dialog';
import { FormField } from './FormField';

interface AdminStepUpDialogProps {
  readonly open: boolean;
  readonly onSuccess: (stepUpExp: number) => void;
  readonly onCancel: () => void;
}

const CODE_LENGTH = 6;
const WRONG_CODE = 'That code did not work. Check your authenticator app and try again.';
const RATE_LIMITED = 'Too many attempts. Wait a few minutes and try again.';
const NETWORK = 'Could not reach the server. Try again.';

/** TOTP prompt for ⚡ actions; on success the BFF has already swapped the access cookie. */
export function AdminStepUpDialog({ open, onSuccess, onCancel }: AdminStepUpDialogProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { envelope } = await postJson<{ stepUpExp: number }>('/api/auth/step-up', { code });
      if (!envelope.success || envelope.data === null) {
        setError(envelope.error?.code === 'RATE_LIMITED' ? RATE_LIMITED : WRONG_CODE);
        return;
      }
      onSuccess(envelope.data.stepUpExp);
    } catch {
      setError(NETWORK);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      titleId="stepup-title"
      describedBy="stepup-description"
      onClose={onCancel}
      size="sm"
      testId="stepup-dialog"
    >
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body">
        <h2 id="stepup-title" className="admin-dialog-title">
          Confirm with your authenticator
        </h2>
        <p id="stepup-description" className="admin-muted">
          This action needs a fresh code. The confirmation stays valid for five minutes.
        </p>
        <FormField id="stepup-code" label="6-digit code" error={error}>
          {(control) => (
            <input
              {...control}
              className="admin-input admin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={CODE_LENGTH}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              data-autofocus
              data-testid="stepup-code"
            />
          )}
        </FormField>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={busy || code.length !== CODE_LENGTH}
            data-testid="stepup-submit"
          >
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
