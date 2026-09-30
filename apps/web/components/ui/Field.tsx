'use client';

import { createContext, type ReactNode, useContext, useId, useMemo } from 'react';

import { cx } from './cx';

export interface FieldContextValue {
  readonly id: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export const useFieldContext = (): FieldContextValue | null => useContext(FieldContext);

interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly id?: string;
  /** Alias for `id` — lets callers pass an id via `htmlFor` to mirror the label/input pattern. */
  readonly htmlFor?: string;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  /** Keeps the label for assistive tech only (search box, newsletter inline form). */
  readonly hideLabel?: boolean;
}

/**
 * Label + control + help/error. The control inside (Input, Select, Textarea) picks up the id,
 * `aria-describedby` and `aria-invalid` from context, so every input is labelled by construction.
 */
export function Field({
  label,
  children,
  id,
  htmlFor,
  help,
  error,
  required = false,
  hideLabel = false,
}: FieldProps) {
  const generated = useId();
  const fieldId = id ?? htmlFor ?? generated;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const value = useMemo<FieldContextValue>(
    () => ({
      id: fieldId,
      describedBy:
        [help === undefined ? null : helpId, error === undefined ? null : errorId]
          .filter((part): part is string => part !== null)
          .join(' ') || undefined,
      invalid: error !== undefined,
      required,
    }),
    [fieldId, helpId, errorId, help, error, required],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className={cx('text-small font-medium text-text', hideLabel && 'sr-only')}
        >
          {label}
          {required && (
            <span aria-hidden="true" className="text-muted">
              {' '}
              *
            </span>
          )}
        </label>
        {children}
        {help !== undefined && (
          <p id={helpId} className="text-small text-muted">
            {help}
          </p>
        )}
        {error !== undefined && (
          <p id={errorId} role="alert" className="text-small text-critical">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
