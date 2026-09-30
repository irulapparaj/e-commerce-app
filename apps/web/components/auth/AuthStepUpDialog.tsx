'use client';

import { type FormEvent, useId } from 'react';

import { useFocusTrap } from '@/hooks/useFocusTrap';

interface AuthStepUpDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (totp: string) => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

/**
 * Step-up authentication dialog — asks for a TOTP code before allowing a
 * sensitive admin or account action.
 *
 * Accessibility (H-42):
 *   - Uses useModal which moves focus to the first focusable element inside
 *     the modal on open (the TOTP input), preventing focus from stranding on
 *     a disabled button outside the dialog.
 *   - role="dialog" + aria-modal="true" + aria-labelledby.
 *   - Background is marked inert.
 */
export function AuthStepUpDialog({
  isOpen,
  onClose,
  onConfirm,
  busy = false,
  error = null,
}: AuthStepUpDialogProps) {
  const headingId = useId();
  const inputId = useId();
  const { modalRef } = useFocusTrap({ isOpen, onClose });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const totp = (data.get('totp') as string | null)?.trim() ?? '';
    if (totp) onConfirm(totp);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(28, 26, 23, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-2)',
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
          maxWidth: '22rem',
          width: '100%',
        }}
      >
        <h2
          id={headingId}
          style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-1)' }}
        >
          Additional verification required
        </h2>
        <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-3)' }}>
          Enter the 6-digit code from your authenticator app.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label htmlFor={inputId}>Authenticator code</label>
            {/* H-42: useModal moves focus here on open — first focusable element */}
            <input
              id={inputId}
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              className="field tabular"
              style={{ letterSpacing: '0.3em', maxWidth: 'min(200px, 100%)' }}
              data-testid="step-up-totp"
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
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
