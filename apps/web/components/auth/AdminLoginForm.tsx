'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { postJson } from '@/lib/auth/client';

import { type Enrolment, EnrolmentPanel } from './EnrolmentPanel';
import { CodeStep, EmailStep, ErrorLine, GENERIC_ERROR } from './OtpFields';

type Step = 'email' | 'otp' | 'totp' | 'enrol';

const ADMIN_HOME = '/admin';

export function AdminLoginForm() {
  const searchParams = useSearchParams();
  // When a storefront login hands off to admin (mfa=1 or enrol=1), skip straight to the right step.
  const fromMfa = searchParams.get('mfa') === '1';
  const fromEnrol = searchParams.get('enrol') === '1';
  const initialStep: Step = fromEnrol ? 'enrol' : fromMfa ? 'totp' : 'email';

  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState('');
  const [nonce, setNonce] = useState('');
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState('');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When arriving via ?enrol=1, the __Host-mfa cookie is already set by the storefront verify-otp
  // call; kick off enrolment immediately using that cookie.
  useEffect(() => {
    if (!fromEnrol) return;
    setBusy(true);
    void postJson<Enrolment>('/api/auth/mfa/enrol', {}).then(({ envelope }) => {
      setBusy(false);
      if (!envelope.success || envelope.data === null) {
        setError(GENERIC_ERROR);
        return;
      }
      setEnrolment(envelope.data);
      setStep('enrol');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
