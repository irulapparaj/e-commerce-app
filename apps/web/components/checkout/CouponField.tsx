'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function CouponField() {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const apply = () => {
    setMessage('Coupons coming soon — check back after our next release.');
  };

  return (
    <div>
      <p className="mb-2 text-small font-medium text-muted">Have a coupon?</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter code"
          aria-label="Coupon code"
          data-testid="coupon-input"
        />
        <Button variant="secondary" size="sm" onClick={apply} disabled={value.trim() === ''} data-testid="coupon-apply">
          Apply
        </Button>
      </div>
      {message !== null && (
        <p className="mt-1 text-small text-muted" data-testid="coupon-error">{message}</p>
      )}
    </div>
  );
}
