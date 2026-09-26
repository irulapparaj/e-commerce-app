'use client';

import { useState } from 'react';

import { postJson } from '@/lib/auth/client';

import { type Enrolment, EnrolmentPanel } from './EnrolmentPanel';
import { CodeStep, EmailStep, ErrorLine, GENERIC_ERROR } from './OtpFields';

type Step = 'email' | 'otp' | 'totp' | 'enrol';

const ADMIN_HOME = '/admin';

export function AdminLoginForm() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [nonce, setNonce] = useState('');
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState('');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const { envelope } = await postJson<{ nonce: string }>('/api/auth/send-otp', { email });
      if (!envelope.success || envelope.data === null) return setError(GENERIC_ERROR);
      setNonce(envelope.data.nonce);
      setStep('otp');
    });

  const verifyOtp = () =>
    run(async () => {
      const { envelope } = await postJson<{
        mfaRequired: boolean;
        mfaEnrolmentRequired: boolean;
        redirect?: string;
      }>('/api/auth/verify-otp', { email, nonce, otp });
      if (!envelope.success || envelope.data === null) return setError(GENERIC_ERROR);
      if (envelope.data.mfaEnrolmentRequired) {
        const enrol = await postJson<Enrolment>('/api/auth/mfa/enrol', {});
        if (!enrol.envelope.success || enrol.envelope.data === null) return setError(GENERIC_ERROR);
        setEnrolment(enrol.envelope.data);
        return setStep('enrol');
      }
      if (envelope.data.mfaRequired) return setStep('totp');
      window.location.assign(envelope.data.redirect ?? ADMIN_HOME);
    });

  const verifyTotp = () =>
    run(async () => {
      const { envelope } = await postJson<{ redirect: string }>('/api/auth/mfa/verify', { code });
      if (!envelope.success) return setError(GENERIC_ERROR);
      window.location.assign(ADMIN_HOME);
    });

  return (
    <section>
      {step === 'email' && (
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          onSubmit={() => void sendCode()}
          busy={busy}
        />
      )}
      {step === 'otp' && (
        <CodeStep
          heading="Enter the code we emailed you"
          label="6-digit code"
          code={otp}
          onCodeChange={setOtp}
          onSubmit={() => void verifyOtp()}
          busy={busy}
          testId="otp"
        />
      )}
      {step === 'enrol' && enrolment !== null && (
        <EnrolmentPanel
          enrolment={enrolment}
          code={code}
          onCodeChange={setCode}
          onSubmit={() => void verifyTotp()}
          busy={busy}
        />
      )}
      {step === 'totp' && (
        <CodeStep
          heading="Enter your authenticator code"
          label="6-digit code or recovery code"
          code={code}
          onCodeChange={setCode}
          onSubmit={() => void verifyTotp()}
          busy={busy}
          pattern="[0-9]{6}|[a-z0-9]{4}-[a-z0-9]{4}"
          testId="totp"
        />
      )}
      <ErrorLine message={error} />
    </section>
  );
}
