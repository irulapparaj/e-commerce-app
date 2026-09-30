'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from '@/i18n/navigation';
import { useCartAdd } from '@/stores/cart';

interface BuyNowProps {
  readonly variantId: string;
  readonly disabled?: boolean;
  readonly quantity: number;
}

export function BuyNow({ variantId, disabled = false, quantity }: BuyNowProps) {
  const t = useTranslations('catalogue');
  const addToCart = useCartAdd();
  const { notify } = useToast();
  const router = useRouter();
  const locale = useLocale();

  const handleClick = async () => {
    await addToCart(variantId, quantity);
    notify(t('addedToCart'), { tone: 'success' });
    router.push(`/${locale}/cart`);
  };

  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={disabled}
      onClick={() => void handleClick()}
    >
      {t('buyNow')}
    </Button>
  );
}
