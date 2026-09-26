'use client';

import { CodeStep } from './OtpFields';

export interface Enrolment {
  readonly secret: string;
  readonly qrDataUrl: string;
  readonly recoveryCodes: readonly string[];
}

interface EnrolmentPanelProps {
  readonly enrolment: Enrolment;
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly busy: boolean;
}

/** First admin login: shows the QR code, the manual secret and the one-time recovery codes. */
export function EnrolmentPanel({
  enrolment,
  code,
  onCodeChange,
  onSubmit,
  busy,
}: EnrolmentPanelProps) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-h3)' }}>Set up your authenticator app</h2>
      <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
        Scan the code or enter the secret manually, then store the recovery codes somewhere safe.
        They are shown once.
      </p>
      <img
        src={enrolment.qrDataUrl}
        alt="TOTP enrolment QR code"
        width={200}
        height={200}
        style={{ marginTop: 'var(--space-2)' }}
      />
      <p
        className="tabular"
        data-testid="totp-secret"
        style={{ marginTop: 'var(--space-1)', wordBreak: 'break-all' }}
      >
        {enrolment.secret}
      </p>
      <ul
        data-testid="recovery-codes"
        className="tabular"
        style={{ columns: 2, marginTop: 'var(--space-2)' }}
      >
        {enrolment.recoveryCodes.map((recoveryCode) => (
          <li key={recoveryCode}>{recoveryCode}</li>
        ))}
      </ul>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <CodeStep
          heading="Confirm with a code from the app"
          label="6-digit code"
          code={code}
          onCodeChange={onCodeChange}
          onSubmit={onSubmit}
          busy={busy}
          testId="totp"
        />
      </div>
    </div>
  );
}
