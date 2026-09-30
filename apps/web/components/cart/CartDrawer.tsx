'use client';

import { useTranslations, useLocale  } from 'next-intl';

import { ButtonLink } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { useCartStore, useCartOpen, useSetCartOpen } from '@/stores/cart';

import { CartLine } from './CartLine';
import { CartSummary } from './CartSummary';
import { EmptyCart } from './EmptyCart';

export function CartDrawer() {
  const t = useTranslations('cart');
  const locale = useLocale();
  const open = useCartOpen();
  const setOpen = useSetCartOpen();
  const cart = useCartStore((s) => s.cart);
  const hydrated = useCartStore((s) => s.hydrated);
  const status = useCartStore((s) => s.status);
  const errorMessage = useCartStore((s) => s.errorMessage);
  const forceRefresh = useCartStore((s) => s.forceRefresh);
  const isEmpty = hydrated && cart.itemCount === 0;

  const footer = isEmpty ? null : (
    <div className="space-y-3">
      <CartSummary />
      <ButtonLink
        href={`/${locale}/checkout`}
        variant="primary"
        fullWidth
        onClick={() => setOpen(false)}
        data-testid="cart-checkout-link"
      >
        {t('checkout')}
      </ButtonLink>
      <ButtonLink
        href={`/${locale}/cart`}
        variant="ghost"
        fullWidth
        onClick={() => setOpen(false)}
        data-testid="cart-view-cart-link"
      >
        {t('viewCart')}
      </ButtonLink>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={t('title', { count: cart.itemCount })}
      footer={footer ?? undefined}
      testId="cart-drawer"
    >
      {status === 'error' && cart.itemCount === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-small text-error">{errorMessage ?? 'Failed to load cart'}</p>
          <button
            type="button"
            onClick={() => void forceRefresh()}
            className="text-small text-accent underline"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <EmptyCart onClose={() => setOpen(false)} />
      ) : (
        <ul className="divide-y divide-hairline" aria-label={t('items')}>
          {status === 'error' && errorMessage !== null && (
            <li role="alert" className="px-4 py-2 text-small text-error">{errorMessage}</li>
          )}
          {cart.items.map((item) => (
            <CartLine key={item.variantId} item={item} />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
