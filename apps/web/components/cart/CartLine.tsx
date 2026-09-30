'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { cx } from '@/components/ui/cx';
import { Price } from '@/components/ui/Price';
import { QuantityStepper, QUANTITY_MAX } from '@/components/ui/QuantityStepper';
import { useCartUpdate, useCartRemove } from '@/stores/cart';
import type { CartItemDto } from '@/stores/cart';

interface CartLineProps {
  readonly item: CartItemDto;
}

const NOTICE_COPY: Record<string, string> = {
  removed: 'This item is no longer available',
  unavailable: 'This item is out of stock',
  reduced: 'Quantity adjusted to available stock',
};

export function CartLine({ item }: CartLineProps) {
  const t = useTranslations('cart');
  const update = useCartUpdate();
  const remove = useCartRemove();
  const unavailable = item.flags.includes('unavailable') || item.flags.includes('removed');
  const notice = item.flags.find((f) => NOTICE_COPY[f] !== undefined);

  return (
    <li className={cx('flex gap-3 py-4', unavailable && 'opacity-60')}>
      {item.imageUrl ? (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-image bg-surface">
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-image bg-surface" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{item.name}</p>
            {item.variantLabel && (
              <p className="text-small text-muted">{item.variantLabel}</p>
            )}
          </div>
          <Price amount={item.lineTotalPaise} size="sm" />
        </div>

        {notice && (
          <p className="text-small text-warning" role="alert">
            {NOTICE_COPY[notice]}
          </p>
        )}

        {unavailable ? (
          <button
            type="button"
            data-testid="cart-item-remove"
            onClick={() => remove(item.variantId)}
            className="text-small text-muted underline decoration-hairline underline-offset-2 hover:text-text self-start"
          >
            {t('remove')}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <QuantityStepper
              value={item.quantity}
              onChange={(qty) => update(item.variantId, qty)}
              min={1}
              max={Math.min(QUANTITY_MAX, item.availableQuantity)}
              testId="cart-qty"
            />
            <button
              type="button"
              data-testid="cart-item-remove"
              onClick={() => remove(item.variantId)}
              className="text-small text-muted underline decoration-hairline underline-offset-2 hover:text-text"
            >
              {t('remove')}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
