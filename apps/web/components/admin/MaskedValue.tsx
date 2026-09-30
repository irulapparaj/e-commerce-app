'use client';

import { useState } from 'react';

import { maskValue } from '@/lib/admin/format';

interface MaskedValueProps {
  readonly value: string;
  /** What the value is, for the button's accessible name ("Reveal phone number"). */
  readonly label: string;
  /** Returns the plain value; may prompt for step-up through `adminApi` (P08). */
  readonly onReveal: () => Promise<string>;
  readonly keepStart?: number;
  readonly keepEnd?: number;
}

const REVEAL_FAILED = 'Could not reveal this value.';

/** `98•••••210` with a Reveal affordance (DESIGN §11.3: PII masked by default). */
export function MaskedValue({
  value,
  label,
  onReveal,
  keepStart = 2,
  keepEnd = 3,
}: MaskedValueProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRevealed(await onReveal());
    } catch {
      setError(REVEAL_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="admin-masked">
      <span className="admin-tabular" data-testid="masked-value">
        {revealed ?? maskValue(value, { keepStart, keepEnd })}
      </span>
      <button
        type="button"
        className="admin-btn admin-btn-small"
        onClick={() => void toggle()}
        disabled={busy}
        aria-label={`${revealed === null ? 'Reveal' : 'Hide'} ${label}`}
      >
        {revealed === null ? 'Reveal' : 'Hide'}
      </button>
      {error !== null && (
        <span role="alert" className="admin-error">
          {error}
        </span>
      )}
    </span>
  );
}
