'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { postJson } from '@/lib/auth/client';

interface ReauthDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called on successful re-authentication. The new access token is written to the
   * __Host-access cookie by the BFF; callers do not need to handle it explicitly. */
  readonly onSuccess: () => void;
  readonly email: string;
}

type Step = 'send' | 'verify';

export function ReauthDialog({ open, onClose, onSuccess, email }: ReauthDialogProps) {
  const t = useTranslations('login');
  const [step, setStep] = useState<Step>('send');
  const [nonce, setNonce] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { modalRef } = useFocusTrap({ isOpen: open, onClose });
  if (!open) return null;

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const { envelope } = await postJson<{ nonce: string }>('/api/auth/reauth/send', { email });
      if (!envelope.success || envelope.data === null) {
        setError(t('genericError'));
        return;
      }
      setNonce(envelope.data.nonce);
      setStep('verify');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      // The BFF writes the new access token to __Host-access; the response body only
      // carries { reauthenticated: true } to signal success.
      const { envelope } = await postJson<{ reauthenticated: boolean }>('/api/auth/reauth/verify', { nonce, otp });
      if (!envelope.success || envelope.data === null) {
        setError(t('genericError'));
        return;
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-heading"
      data-testid="reauth-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--scrim)',
        padding: 'var(--gutter)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-control)',
          padding: 'var(--space-5)',
          width: '100%',
          maxWidth: '24rem',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <h2 id="reauth-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-2)' }}>
          Verify your identity
        </h2>

        {step === 'send' ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-3)' }}>
              We will send a one-time code to {email}.
            </p>
            <button className="btn btn-primary" onClick={() => void sendCode()} disabled={busy} style={{ width: '100%' }}>
              {t('sendCode')}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)' }}>
              Enter the 6-digit code we sent to {email}.
            </p>
            <label htmlFor="reauth-otp" style={{ display: 'block', fontSize: 'var(--text-small)', marginBottom: 'var(--space-1)' }}>
              Verification code
            </label>
            <input
              id="reauth-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              className="field"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ marginBottom: 'var(--space-2)' }}
              aria-describedby={error ? 'reauth-error' : undefined}
            />
            <button className="btn btn-primary" onClick={() => void verify()} disabled={busy || otp.length !== 6} style={{ width: '100%' }}>
              {t('verify')}
            </button>
          </>
        )}

        {error !== null && (
          <p id="reauth-error" role="alert" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)', marginTop: 'var(--space-2)' }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
