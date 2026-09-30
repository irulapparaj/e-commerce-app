'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { cx } from '@/components/ui/cx';
import { Price } from '@/components/ui/Price';
import type { VariantDto } from '@/lib/api/types';

interface VariantSelectorProps {
  readonly variants: readonly VariantDto[];
  readonly selectedId: string;
  readonly onChange: (id: string) => void;
}

export function VariantSelector({ variants, selectedId, onChange }: VariantSelectorProps) {
  const t = useTranslations('catalogue');
  const groupId = useId();

  if (variants.length <= 1) return null;

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${groupId}-label`}
      className="flex flex-col gap-2"
    >
      <span id={`${groupId}-label`} className="text-small font-medium text-text">
        {t('selectVariant', { label: variants[0]?.label ?? '' })}
      </span>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          const label = variant.inStock
            ? variant.label
            : t('variantOutOfStock', { label: variant.label });

          return (
            <label
              key={variant.id}
              data-testid="variant-option"
              title={variant.inStock ? undefined : t('outOfStock')}
              className={cx(
                'relative flex cursor-pointer flex-col gap-1 rounded-control border px-3 py-2 transition-colors duration-fast ease-out focus-within:ring-2 focus-within:ring-accent focus-within:outline-none',
                selected
                  ? 'border-text bg-surface'
                  : 'border-hairline bg-transparent hover:border-muted',
                !variant.inStock && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name={groupId}
                value={variant.id}
                checked={selected}
                disabled={!variant.inStock}
                onChange={() => onChange(variant.id)}
                aria-label={label}
                className="sr-only"
              />
              <span className="text-small font-medium text-text">{variant.label}</span>
              <Price amount={variant.price} compareAt={variant.compareAtPrice} size="sm" />
              {!variant.inStock && (
                <span className="text-caption text-muted">{t('outOfStock')}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
