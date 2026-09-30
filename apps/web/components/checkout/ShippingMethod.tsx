import { formatPrice } from '@/lib/format';

interface ShippingMethodProps {
  readonly ratePaise: number;
  readonly etaDays: number | null;
  readonly isFree: boolean;
}

export function ShippingMethod({ ratePaise, etaDays, isFree }: ShippingMethodProps) {
  return (
    <div className="rounded-card border border-accent bg-surface p-4">
      <label className="flex cursor-pointer items-center gap-3">
        <input type="radio" checked readOnly className="accent-accent" />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <p className="font-medium">Standard delivery</p>
            {etaDays !== null && (
              <p className="text-small text-muted">Arrives in {etaDays} business days</p>
            )}
          </div>
          <span className="font-medium">
            {isFree ? (
              <span className="text-accent">Free</span>
            ) : (
              formatPrice(ratePaise)
            )}
          </span>
        </div>
      </label>
    </div>
  );
}
