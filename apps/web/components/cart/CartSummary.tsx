'use client';

import { useTranslations } from 'next-intl';

import { Price } from '@/components/ui/Price';
import { useCartStore } from '@/stores/cart';

import { FreeShippingBar } from './FreeShippingBar';

export function CartSummary() {
  const t = useTranslations('cart');
  const cart = useCartStore((s) => s.cart);

  return (
    <div className="border-t border-hairline pt-4">
      <FreeShippingBar
        spent={cart.subtotalPaise}
        amountToFree={cart.freeShipping.thresholdPaise}
      />

      <dl className="space-y-2 text-base">
        <div className="flex justify-between">
          <dt className="text-muted">{t('subtotal')}</dt>
          <dd><Price amount={cart.subtotalPaise} size="sm" /></dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t('shipping')}</dt>
          <dd className="text-small text-muted">
            {cart.freeShipping.reached ? t('shippingFree') : t('shippingCalculated')}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
        <span className="font-medium">{t('total')}</span>
        <Price amount={cart.subtotalPaise} size="md" />
      </div>

      {cart.notices.length > 0 && (
        <ul className="mt-3 space-y-1" role="list">
          {cart.notices.map((notice) => (
            <li key={notice} className="text-small text-warning" role="alert">
              {notice}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
