import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';

interface ChoiceProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'className' | 'children'
> {
  readonly label: ReactNode;
  readonly description?: string;
}

interface ChoiceControlProps extends ChoiceProps {
  readonly type: 'checkbox' | 'radio';
}

/** Native control tinted with the accent; the label carries the 44 px target. */
function ChoiceControl({ type, label, description, id, ...rest }: ChoiceControlProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = `${inputId}-description`;
  return (
    <div className="flex items-start gap-3">
      <input
        type={type}
        id={inputId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        className="mt-3 size-4 shrink-0 accent-accent disabled:opacity-50"
        {...rest}
      />
      <span className="flex min-h-touch flex-col justify-center py-2 text-base">
        <label htmlFor={inputId}>{label}</label>
        {description !== undefined && (
          <span id={descriptionId} className="text-small text-muted">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <ChoiceControl type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <ChoiceControl type="radio" {...props} />;
}
