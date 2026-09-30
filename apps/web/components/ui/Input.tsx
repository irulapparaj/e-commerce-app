'use client';

import type { ComponentPropsWithRef } from 'react';

import { cx } from './cx';
import { useFieldContext } from './Field';
import { Icon } from './Icon';

const CONTROL =
  'w-full min-h-touch rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-base text-text transition-colors duration-fast ease-out placeholder:text-muted hover:border-muted focus-visible:border-text disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-critical';

type AriaInvalid = ComponentPropsWithRef<'input'>['aria-invalid'];

interface ControlAria {
  readonly id?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-invalid'?: AriaInvalid;
  readonly required?: boolean | undefined;
}

/** Explicit props win; otherwise the surrounding `Field` supplies id, description and validity. */
const useControlAria = <P extends ControlAria>(props: P): ControlAria => {
  const field = useFieldContext();
  if (field === null) return {};
  return {
    id: props.id ?? field.id,
    'aria-describedby': props['aria-describedby'] ?? field.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid ? true : undefined),
    required: props.required ?? field.required,
  };
};

type InputProps = Omit<ComponentPropsWithRef<'input'>, 'className'>;

export function Input(props: InputProps) {
  const aria = useControlAria(props);
  return <input {...props} {...aria} className={CONTROL} />;
}

type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'className'>;

export function Textarea(props: TextareaProps) {
  const aria = useControlAria(props);
  return <textarea rows={4} {...props} {...aria} className={cx(CONTROL, 'min-h-28 resize-y')} />;
}

type SelectProps = Omit<ComponentPropsWithRef<'select'>, 'className'>;

export function Select(props: SelectProps) {
  const aria = useControlAria(props);
  return (
    <span className="relative block">
      <select {...props} {...aria} className={cx(CONTROL, 'appearance-none pr-10')} />
      <Icon
        name="chevron"
        size={16}
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
