'use client';

import { type FormEvent, useId } from 'react';

import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ChangeEmailDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (newEmail: string) => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

/**
 * Dialog for changing the account email address.
 *
 * Accessibility (H-39):
 *   - Uses useModal for focus trapping, inert background, and focus restore.
 *   - role="dialog" + aria-modal="true" + aria-labelledby.
 */
export function ChangeEmailDialog({
  isOpen,
  onClose,
  onConfirm,
  busy = false,
  error = null,
}: ChangeEmailDialogProps) {
  const headingId = useId();
  const emailId = useId();
  const { modalRef } = useFocusTrap({ isOpen, onClose });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newEmail = (data.get('newEmail') as string | null)?.trim() ?? '';
    if (newEmail) onConfirm(newEmail);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(28, 26, 23, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-2)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-control)',
          boxShadow: 'var(--shadow-modal)',
          padding: 'var(--space-4)',
          maxWidth: '28rem',
          width: '100%',
        }}
      >
        <h2
          id={headingId}
          style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-2)' }}
        >
          Change email address
        </h2>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label htmlFor={emailId}>New email address</label>
            <input
              id={emailId}
              name="newEmail"
              type="email"
              autoComplete="email"
              required
              className="field"
            />
          </div>

          {error !== null && (
            <p role="alert" className="critical">
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending code…' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
