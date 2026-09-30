'use client';

import { useRef } from 'react';

interface OtpBoxInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly id: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}

const BOX_COUNT = 6;

export function OtpBoxInput({ value, onChange, id, disabled, autoFocus }: OtpBoxInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const digits = Array.from({ length: BOX_COUNT }, (_, i) => value[i] ?? '');

  const focusBox = (index: number) => {
    const container = containerRef.current;
    if (container === null) return;
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    inputs[Math.max(0, Math.min(index, BOX_COUNT - 1))]?.focus();
  };

  const handleChange = (index: number, char: string) => {
    const cleaned = char.replace(/\D/g, '');
    if (cleaned === '') return;
    const next = digits.slice();
    next[index] = cleaned.slice(-1);
    onChange(next.join(''));
    if (index < BOX_COUNT - 1) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = digits.slice();
      if (next[index] !== '') {
        next[index] = '';
        onChange(next.join(''));
      } else if (index > 0) {
        next[index - 1] = '';
        onChange(next.join(''));
        focusBox(index - 1);
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < BOX_COUNT - 1) {
      focusBox(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, BOX_COUNT);
    if (pasted.length > 0) {
      onChange(pasted.padEnd(BOX_COUNT, '').slice(0, BOX_COUNT).replace(/\s/g, '').trimEnd());
      onChange(pasted);
      focusBox(Math.min(pasted.length, BOX_COUNT - 1));
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', gap: 'var(--space-1)' }}
      aria-label="One-time code"
      role="group"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          id={i === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={digit}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${BOX_COUNT}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          style={{
            flex: '1 1 2rem',
            maxWidth: '2.75rem',
            height: '3rem',
            textAlign: 'center',
            fontSize: 'var(--text-h3)',
            fontWeight: '600',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-control)',
            background: 'var(--bg)',
            color: 'var(--text)',
            outline: 'none',
            caretColor: 'var(--accent)',
            transition: 'border-color var(--duration-fast) var(--ease-out)',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--hairline)'; }}
          data-testid={`otp-digit-${i}`}
        />
      ))}
    </div>
  );
}
