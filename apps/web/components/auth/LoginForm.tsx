'use client';

import { useState } from 'react';

import { postJson } from '@/lib/auth/client';

import { CodeStep, EmailStep, ErrorLine, GENERIC_ERROR } from './OtpFields';

interface LoginFormProps {
  readonly redirectTo: string;
}

type Step = 'email' | 'otp';

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [nonce, setNonce] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { envelope } = await postJson<{ nonce: string }>('/api/auth/send-otp', { email });
    setBusy(false);
    if (!envelope.success || envelope.data === null) {
      setError(
        envelope.error?.code === 'RATE_LIMITED'
          ? 'Too many codes requested. Try again later.'
          : GENERIC_ERROR,
      );
      return;
    }
    setNonce(envelope.data.nonce);
    setStep('otp');
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const { envelope } = await postJson<{ redirect: string }>('/api/auth/verify-otp', {
      email,
      nonce,
      otp,
    });
    setBusy(false);
    if (!envelope.success) {
      setError(GENERIC_ERROR);
      return;
    }
    window.location.assign(redirectTo);
  };

  return (
    <section>
      {step === 'email' ? (
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          onSubmit={() => void sendCode()}
          busy={busy}
        />
      ) : (
        <CodeStep
          heading="Enter the code we emailed you"
          label="6-digit code"
          code={otp}
          onCodeChange={setOtp}
          onSubmit={() => void verifyCode()}
          busy={busy}
          testId="otp"
        />
      )}
      <ErrorLine message={error} />
    </section>
  );
}
