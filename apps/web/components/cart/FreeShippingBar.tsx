import { formatPrice } from '@/lib/format';

interface FreeShippingBarProps {
  /** Amount already spent, in paise. */
  readonly spent: number;
  /** Threshold in paise at which free shipping is unlocked. */
  readonly amountToFree: number;
}

export function FreeShippingBar({ spent, amountToFree }: FreeShippingBarProps) {
  if (amountToFree === 0) return null;

  const progress = Math.min(100, Math.round((spent / amountToFree) * 100));
  const reached = spent >= amountToFree;
  const remaining = Math.max(0, amountToFree - spent);

  return (
    <div className="mb-4 text-small">
      <p className="mb-1 text-muted">
        {reached
          ? 'You unlocked free shipping!'
          : `Add ${formatPrice(remaining)} more for free shipping`}
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-accent transition-all duration-normal ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={reached ? 'Free shipping unlocked' : `${progress}% towards free shipping`}
        />
      </div>
    </div>
  );
}
