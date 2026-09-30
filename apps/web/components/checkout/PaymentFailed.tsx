'use client';

import { Button } from '@/components/ui/Button';

interface PaymentFailedProps {
  readonly onRetry: () => void;
  readonly minutesRemaining?: number;
}

export function PaymentFailed({ onRetry, minutesRemaining = 30 }: PaymentFailedProps) {
  return (
    <div
      role="alert"
      data-testid="payment-error"
      className="rounded-card border border-warning/30 bg-warning/5 p-6 text-center"
    >
      <p className="mb-1 text-h3 font-medium text-text">Payment was not completed</p>
      <p className="mb-4 text-small text-muted">
        Your order is held for {minutesRemaining} minutes. You can try again.
      </p>
      <Button variant="primary" onClick={onRetry} data-testid="payment-retry">
        Try again
      </Button>
    </div>
  );
}
