'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Price } from '@/components/ui/Price';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import type { ProductDetailDto, PublicSettings } from '@/lib/api/types';

import { AddToCart } from './AddToCart';
import { BuyNow } from './BuyNow';
import { DeliveryNotes } from './DeliveryNotes';
import { VariantSelector } from './VariantSelector';

interface ProductInfoProps {
  readonly product: ProductDetailDto;
  readonly settings: PublicSettings;
}

export function ProductInfo({ product, settings }: ProductInfoProps) {
  const t = useTranslations('catalogue');
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const [selectedId, setSelectedId] = useState(defaultVariant?.id ?? '');
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = product.variants.find((v) => v.id === selectedId) ?? defaultVariant;
  const outOfStock = selectedVariant !== undefined ? !selectedVariant.inStock : !product.inStock;
  const lowStock = selectedVariant !== undefined ? selectedVariant.lowStock : product.lowStock;

  const displayPrice = selectedVariant?.price ?? product.priceFrom;
  const displayCompareAt = selectedVariant?.compareAtPrice ?? product.compareAtFrom;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-h1 text-text">{product.name}</h1>

      <div className="flex flex-wrap items-center gap-2">
        {outOfStock && <Badge tone="muted">{t('outOfStock')}</Badge>}
        {!outOfStock && lowStock && <Badge tone="default">{t('lowStock')}</Badge>}
        {!outOfStock && !lowStock && <Badge tone="success">{t('inStock')}</Badge>}
      </div>

      <span data-testid="product-price">
        <Price amount={displayPrice} compareAt={displayCompareAt} size="lg" />
      </span>

      <p className="text-caption text-muted">{t('inclTax')}</p>

      <VariantSelector
        variants={product.variants}
        selectedId={selectedId}
        onChange={setSelectedId}
      />

      <div className="flex flex-col gap-2">
        <label className="text-small font-medium text-text">{t('quantity')}</label>
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          disabled={outOfStock}
        />
      </div>

      <div className="flex flex-col gap-3">
        <AddToCart
          variantId={selectedId}
          disabled={outOfStock}
          quantity={quantity}
        />
        <BuyNow
          variantId={selectedId}
          disabled={outOfStock}
          quantity={quantity}
        />
      </div>

      <DeliveryNotes settings={settings} />
    </div>
  );
}
