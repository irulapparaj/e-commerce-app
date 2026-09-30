'use client';

import type { FormEvent } from 'react';

interface EmailStepProps {
  readonly email: string;
  readonly onEmailChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly busy: boolean;
}

export function EmailStep({ email, onEmailChange, onSubmit, busy }: EmailStepProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={handleSubmit} aria-labelledby="email-step-heading">
      <h2 id="email-step-heading" style={{ fontSize: 'var(--text-h3)' }}>
        Sign in with your email
      </h2>
      <label htmlFor="email" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="field"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        style={{ marginTop: 'var(--space-1)' }}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy}
        style={{ marginTop: 'var(--space-2)' }}
      >
        Send code
      </button>
    </form>
  );
}

interface CodeStepProps {
  readonly heading: string;
  readonly label: string;
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly busy: boolean;
  readonly pattern?: string;
  readonly testId?: string;
}

export function CodeStep({
  heading,
  label,
  code,
  onCodeChange,
  onSubmit,
  busy,
  pattern = '[0-9]{6}',
  testId = 'code',
}: CodeStepProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="code-step-heading"
      style={{ maxWidth: 'min(304px, 100%)' }}
    >
      <h2 id="code-step-heading" style={{ fontSize: 'var(--text-h3)' }}>
        {heading}
      </h2>
      <label htmlFor="code" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
        {label}
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={pattern}
        required
        className="field tabular"
        data-testid={testId}
        value={code}
        onChange={(event) => onCodeChange(event.target.value.trim())}
        style={{ marginTop: 'var(--space-1)', letterSpacing: '0.3em' }}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy}
        style={{ marginTop: 'var(--space-2)' }}
      >
        Continue
      </button>
    </form>
  );
}

export function ErrorLine({ message }: { readonly message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="critical" style={{ marginTop: 'var(--space-2)' }}>
      {message}
    </p>
  );
}

export const GENERIC_ERROR = 'That did not work. Check the details and try again.';
