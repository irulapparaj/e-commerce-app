'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { createOrder, ApiCallError } from '@/lib/api/checkout';
import type { CreateOrderResult } from '@/lib/api/types';
import { getOrCreateIdempotencyKey } from '@/lib/checkout/idempotency';
import { useCartStore } from '@/stores/cart';

interface PayButtonProps {
  readonly addressId: string;
  readonly disabled?: boolean;
  readonly onOrderCreated: (result: CreateOrderResult) => void;
}

const ERROR_COPY: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Some items are out of stock. Please update your cart.',
  PRICE_CHANGED: 'Prices changed. Please review your order.',
  CART_EMPTY: 'Your cart is empty.',
  PIN_NOT_SERVICEABLE: 'Delivery is not available to your PIN code.',
  IDEMPOTENCY_IN_PROGRESS: 'Your order is being processed. Please wait a moment.',
};

export function PayButton({ addressId, disabled = false, onOrderCreated }: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cartItems = useCartStore((s) => s.cart.items);
  const forceRefresh = useCartStore((s) => s.forceRefresh);

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const key = getOrCreateIdempotencyKey();
      const result = await createOrder(
        {
          addressId,
          shippingMethod: 'standard',
          items: cartItems
            .filter((item) => item.quantity >= 1)
            .map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        },
        key,
      );
      // Clear the guest cart cookie now that the order has been placed.
      await fetch('/api/cart-session', { method: 'PATCH', credentials: 'same-origin' }).catch(() => {});
      onOrderCreated(result);
    } catch (err) {
      const code = err instanceof ApiCallError ? err.code : null;
      // H-17: refresh cart so stale prices/stock are reflected immediately
      if (code === 'PRICE_CHANGED' || code === 'INSUFFICIENT_STOCK') {
        await forceRefresh();
      }
      const msg = err instanceof ApiCallError
        ? (ERROR_COPY[err.code] ?? err.message)
        : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        variant="primary"
        fullWidth
        loading={loading}
        disabled={disabled || loading}
        onClick={handlePay}
        data-testid="place-order"
      >
        Pay now
      </Button>
      {error !== null && (
        <p className="mt-2 text-small text-error" role="alert" data-testid="payment-error">{error}</p>
      )}
    </div>
  );
}
