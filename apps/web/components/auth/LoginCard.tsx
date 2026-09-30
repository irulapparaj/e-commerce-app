'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';


import { postJson } from '@/lib/auth/client';

import { OtpBoxInput } from './OtpBoxInput';

interface LoginCardProps {
  readonly redirectTo: string;
}

type Step = 'email' | 'otp';

const RESEND_COUNTDOWN_SECONDS = 30;

export function LoginCard({ redirectTo }: LoginCardProps) {
  const t = useTranslations('login');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [nonce, setNonce] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  const startResendCountdown = () => {
    setResendSecondsLeft(RESEND_COUNTDOWN_SECONDS);
    const timer = setInterval(() => {
      setResendSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { envelope } = await postJson<{ nonce: string }>('/api/auth/send-otp', { email });
    setBusy(false);
    if (!envelope.success || envelope.data === null) {
      setError(
        envelope.error?.code === 'RATE_LIMITED'
          ? 'Too many codes requested. Please try again later.'
          : t('genericError'),
      );
      return;
    }
    setNonce(envelope.data.nonce);
    setStep('otp');
    setOtp('');
    startResendCountdown();
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const { envelope } = await postJson<{
      mfaRequired?: boolean;
      mfaEnrolmentRequired?: boolean;
    }>('/api/auth/verify-otp', {
      email,
      nonce,
      otp,
    });
    setBusy(false);
    if (!envelope.success) {
      setError(t('genericError'));
      return;
    }
    if (envelope.data?.mfaEnrolmentRequired) {
      // Staff / admin user needs to set up TOTP — hand off to the admin login enrolment flow.
      window.location.assign(`/admin/login?enrol=1&redirect=${encodeURIComponent(redirectTo)}`);
      return;
    }
    if (envelope.data?.mfaRequired) {
      // Staff / admin user has TOTP already — hand off to the admin login TOTP step.
      window.location.assign(`/admin/login?mfa=1&redirect=${encodeURIComponent(redirectTo)}`);
      return;
    }
    window.location.assign(redirectTo);
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-control)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      {step === 'email' ? (
        <form
          ref={formRef}
          onSubmit={(e) => { e.preventDefault(); void sendCode(); }}
          aria-labelledby="login-email-heading"
        >
          <h2 id="login-email-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-1)' }}>
            {t('title')}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-4)' }}>
            {t('subtitle')}
          </p>
          <label htmlFor="login-email" style={{ display: 'block', fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-1)' }}>
            {t('emailLabel')}
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            className="field"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 'var(--space-3)' }}
            aria-describedby={error !== null ? 'login-error' : undefined}
          />
          {error !== null && (
            <p id="login-error" role="alert" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {t('sendCode')}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}
          aria-labelledby="login-otp-heading"
        >
          <h2 id="login-otp-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-1)' }}>
            {t('otpHeading')}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-4)' }}>
            {t('otpBody', { email })}
          </p>
          <label htmlFor="otp-digit-0" style={{ display: 'block', fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-2)' }}>
            {t('otpLabel')}
          </label>
          <OtpBoxInput
            id="otp-digit-0"
            value={otp}
            onChange={setOtp}
            disabled={busy}
            autoFocus
          />
          {error !== null && (
            <p role="alert" aria-live="polite" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)', marginTop: 'var(--space-2)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || otp.length !== 6}
            style={{ width: '100%', marginTop: 'var(--space-3)' }}
          >
            {t('verify')}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setStep('email'); setOtp(''); setError(null); }}
              style={{ fontSize: 'var(--text-small)' }}
            >
              {t('backToEmail')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void sendCode()}
              disabled={resendSecondsLeft > 0 || busy}
              style={{ fontSize: 'var(--text-small)' }}
            >
              {resendSecondsLeft > 0 ? t('resendIn', { seconds: resendSecondsLeft }) : t('resend')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
