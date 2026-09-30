import type { ReactNode } from 'react';

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
}

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly help?: string;
  readonly error?: string | null;
  /** Checkbox layout: control first, label after. */
  readonly inline?: boolean;
  readonly children: (control: FieldControlProps) => ReactNode;
}

/** Label + help + error wiring (`aria-describedby`, `aria-invalid`) for any control. */
export function FormField({ id, label, help, error, inline = false, children }: FormFieldProps) {
  const helpId = help === undefined ? undefined : `${id}-help`;
  const errorId = error === undefined || error === null || error === '' ? undefined : `${id}-error`;
  const describedBy = [helpId, errorId].filter((value) => value !== undefined).join(' ');
  const control: FieldControlProps = {
    id,
    ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    ...(errorId === undefined ? {} : { 'aria-invalid': true as const }),
  };
  const labelNode = (
    <label htmlFor={id} className="admin-label">
      {label}
    </label>
  );

  return (
    <div className={inline ? 'admin-field admin-field-inline' : 'admin-field'}>
      {inline ? children(control) : labelNode}
      {inline ? labelNode : children(control)}
      {helpId !== undefined && (
        <p id={helpId} className="admin-help">
          {help}
        </p>
      )}
      {errorId !== undefined && (
        <p id={errorId} className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
