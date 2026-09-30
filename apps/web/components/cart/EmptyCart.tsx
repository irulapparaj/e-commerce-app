'use client';

import { useTranslations, useLocale  } from 'next-intl';

import { ButtonLink } from '@/components/ui/Button';

interface EmptyCartProps {
  readonly onClose?: () => void;
}

export function EmptyCart({ onClose }: EmptyCartProps) {
  const t = useTranslations('cart');
  const locale = useLocale();

  return (
    <div data-testid="cart-empty" className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-full bg-surface text-3xl"
        aria-hidden="true"
      >
        🛒
      </div>
      <div>
        <p className="font-medium text-text">{t('empty')}</p>
        <p className="mt-1 text-small text-muted">{t('emptyHint')}</p>
      </div>
      <ButtonLink
        href={`/${locale}`}
        variant="secondary"
        size="sm"
        onClick={onClose}
      >
        {t('continueShopping')}
      </ButtonLink>
    </div>
  );
}
