'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useCartAdd } from '@/stores/cart';

interface AddToCartProps {
  readonly variantId: string;
  readonly disabled?: boolean;
  readonly quantity: number;
}

export function AddToCart({ variantId, disabled = false, quantity }: AddToCartProps) {
  const t = useTranslations('catalogue');
  const addToCart = useCartAdd();
  const { notify } = useToast();

  const handleClick = () => {
    void addToCart(variantId, quantity);
    notify(t('addedToCart'), { tone: 'success' });
  };

  return (
    <Button
      variant="primary"
      fullWidth
      disabled={disabled}
      onClick={handleClick}
    >
      {disabled ? t('outOfStock') : t('addToCart')}
    </Button>
  );
}
