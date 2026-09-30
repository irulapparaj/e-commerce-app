'use client';

import { useTranslations, useLocale  } from 'next-intl';
import { useEffect } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { useCartStore } from '@/stores/cart';

import { CartLine } from './CartLine';
import { CartSummary } from './CartSummary';
import { EmptyCart } from './EmptyCart';

export function CartPageClient() {
  const t = useTranslations('cart');
  const locale = useLocale();
  const cart = useCartStore((s) => s.cart);
  const hydrated = useCartStore((s) => s.hydrated);
  const hydrate = useCartStore((s) => s.hydrate);
  const status = useCartStore((s) => s.status);
  const errorMessage = useCartStore((s) => s.errorMessage);
  const forceRefresh = useCartStore((s) => s.forceRefresh);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const isLoading = !hydrated;
  const isError = hydrated && status === 'error' && cart.itemCount === 0;
  const isEmpty = hydrated && status !== 'error' && cart.itemCount === 0;

  return (
    <div className="mx-auto max-w-screen-lg px-gutter py-section">
      <h1 className="mb-8 text-h1">{t('pageTitle')}</h1>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label={t('loading')}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 rounded-card border border-hairline p-4 animate-pulse">
              <div className="size-20 shrink-0 rounded-control bg-surface" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-1/2 rounded bg-surface" />
                <div className="h-3 w-1/4 rounded bg-surface" />
              </div>
              <div className="h-4 w-16 rounded bg-surface" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted">{errorMessage ?? 'Failed to load cart'}</p>
          <button
            type="button"
            onClick={() => void forceRefresh()}
            className="text-small text-accent underline"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <EmptyCart />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section aria-label={t('items')}>
            {status === 'error' && errorMessage !== null && (
              <p role="alert" className="mb-4 text-small text-error">{errorMessage}</p>
            )}
            <ul className="divide-y divide-hairline" aria-label={t('items')}>
              {cart.items.map((item) => (
                <CartLine key={item.variantId} item={item} />
              ))}
            </ul>
          </section>

          <aside>
            <div className="rounded-card border border-hairline p-6">
              <h2 className="mb-4 text-h3">{t('orderSummary')}</h2>
              <CartSummary />
              <div className="mt-4 space-y-3">
                <ButtonLink
                  href={`/${locale}/checkout`}
                  variant="primary"
                  fullWidth
                >
                  {t('checkout')}
                </ButtonLink>
                <ButtonLink
                  href={`/${locale}`}
                  variant="ghost"
                  fullWidth
                >
                  {t('continueShopping')}
                </ButtonLink>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
