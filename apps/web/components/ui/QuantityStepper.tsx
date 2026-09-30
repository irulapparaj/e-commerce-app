'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useId, useState } from 'react';

import { cx } from './cx';
import { Icon } from './Icon';

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 20;

export const clampQuantity = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min));

interface QuantityStepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly id?: string;
  readonly testId?: string;
}

const STEP_BUTTON =
  'inline-flex size-touch items-center justify-center text-text transition-colors duration-fast ease-out hover:bg-surface disabled:pointer-events-none disabled:opacity-40';

/** 1–20 by default; ↑/↓ step, Home/End jump, typed values clamp on blur or Enter. */
export function QuantityStepper({
  value,
  onChange,
  min = QUANTITY_MIN,
  max = QUANTITY_MAX,
  disabled = false,
  label,
  id,
  testId,
}: QuantityStepperProps) {
  const t = useTranslations('a11y');
  const generated = useId();
  const inputId = id ?? generated;
  const [draft, setDraft] = useState<string | null>(null);
  const name = label ?? t('quantity');

  const step = (delta: number) => onChange(clampQuantity(value + delta, min, max));

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    onChange(clampQuantity(Number.isNaN(parsed) ? value : parsed, min, max));
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const actions: Readonly<Record<string, () => void>> = {
      ArrowUp: () => step(1),
      ArrowDown: () => step(-1),
      Home: () => onChange(min),
      End: () => onChange(max),
      Enter: () => commit(event.currentTarget.value),
    };
    const action = actions[event.key];
    if (action === undefined) return;
    event.preventDefault();
    action();
  };

  return (
    <div
      role="group"
      aria-label={name}
      className={cx(
        'inline-flex items-stretch rounded-control border border-hairline bg-surface',
        disabled && 'opacity-50',
      )}
      data-testid="quantity-stepper"
    >
      <button
        type="button"
        aria-label={t('decrease')}
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        className={STEP_BUTTON}
        {...(testId !== undefined ? { 'data-testid': `${testId}-decrease` } : {})}
      >
        <Icon name="minus" size={16} />
      </button>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        role="spinbutton"
        aria-label={name}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        value={draft ?? String(value)}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-12 border-x border-hairline bg-transparent text-center text-base tabular-nums text-text"
        {...(testId !== undefined ? { 'data-testid': `${testId}-value` } : {})}
      />
      <button
        type="button"
        aria-label={t('increase')}
        disabled={disabled || value >= max}
        onClick={() => step(1)}
        className={STEP_BUTTON}
        {...(testId !== undefined ? { 'data-testid': `${testId}-increase` } : {})}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
