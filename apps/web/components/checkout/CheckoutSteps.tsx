import { cx } from '@/components/ui/cx';

export type CheckoutStep = 'contact' | 'address' | 'shipping' | 'payment';

const STEPS: readonly { readonly key: CheckoutStep; readonly label: string }[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'address', label: 'Address' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'payment', label: 'Payment' },
];

interface CheckoutStepsProps {
  readonly current: CheckoutStep;
}

export function CheckoutSteps({ current }: CheckoutStepsProps) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={step.key} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-small font-semibold',
                    done && 'bg-accent text-accent-contrast',
                    active && 'border-2 border-accent text-accent',
                    !done && !active && 'border border-hairline text-muted',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? '✓' : idx + 1}
                </span>
                <span
                  className={cx(
                    'text-small',
                    active && 'font-medium text-text',
                    !active && 'text-muted',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="mx-3 h-px w-8 bg-hairline" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
