import { Price } from '@/components/ui/Price';
import { formatPrice } from '@/lib/format';
import type { CartDto } from '@/stores/cart';

interface OrderSummaryProps {
  readonly cart: CartDto;
  readonly shippingPaise: number;
  readonly isFreeShipping: boolean;
  readonly cgst?: number;
  readonly sgst?: number;
  readonly igst?: number;
}

export function OrderSummary({ cart, shippingPaise, isFreeShipping, cgst = 0, sgst = 0, igst = 0 }: OrderSummaryProps) {
  const total = cart.subtotalPaise + (isFreeShipping ? 0 : shippingPaise);
  const hasTax = cgst > 0 || sgst > 0 || igst > 0;

  return (
    <div className="space-y-3 text-base">
      <ul className="space-y-2" aria-label="Order items">
        {cart.items.map((item) => (
          <li key={item.variantId} className="flex justify-between gap-2">
            <span className="truncate text-muted">
              {item.name}
              {item.variantLabel !== '' && (
                <span className="text-small"> · {item.variantLabel}</span>
              )}
              {' '}× {item.quantity}
            </span>
            <Price amount={item.lineTotalPaise} size="sm" />
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-hairline pt-3">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span>
          <Price amount={cart.subtotalPaise} size="sm" />
        </div>
        <div className="flex justify-between text-muted">
          <span>Shipping</span>
          {isFreeShipping ? (
            <span className="text-accent">Free</span>
          ) : (
            <span>{formatPrice(shippingPaise)}</span>
          )}
        </div>
        {hasTax && (
          <p className="text-small text-muted">
            {igst > 0
              ? `Includes IGST ${formatPrice(igst)}`
              : `Includes CGST ${formatPrice(cgst)} + SGST ${formatPrice(sgst)}`}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-3 font-semibold">
        <span>Total</span>
        <Price amount={total} size="md" />
      </div>
    </div>
  );
}
