'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { Price } from '@/components/ui/Price';
import { useToast } from '@/components/ui/Toast';
import { Link } from '@/i18n/navigation';
import type { ProductSummaryDto } from '@/lib/api/types';
import { discountPercent } from '@/lib/format';
import { useCartAdd } from '@/stores/cart';

interface ProductCardProps {
  readonly product: ProductSummaryDto;
  readonly locale: string;
  readonly view?: 'grid' | 'list';
}

const GRID_SIZES = '(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw';
const LIST_SIZES = '112px';

/**
 * Image, name, price and one quiet "Add to cart" (DESIGN.md §16: the accent stays on the page's
 * primary action). Quantity is adjusted in the cart drawer, which opens on add. Availability is
 * only spoken when it matters: "Only a few left" and "Out of stock", never "In stock" on every card.
 * The whole card is a link; the button sits above it so the nested-control pattern stays accessible.
 */
export function ProductCard({ product, locale, view = 'grid' }: ProductCardProps) {
  const t = useTranslations('catalogue');
  const addToCart = useCartAdd();
  const { notify } = useToast();

  const [imgError, setImgError] = useState(false);
  const handleImgError = useCallback(() => setImgError(true), []);

  const isGrid = view === 'grid';
  const percent = discountPercent(product.priceFrom, product.compareAtFrom);
  const onSale = percent !== null;
  const canAdd = product.inStock && product.defaultVariantId !== null;
  const rating = product.ratingSummary;

  const handleAddToCart = () => {
    if (product.defaultVariantId === null) return;
    void addToCart(product.defaultVariantId, 1);
    notify(t('addedToCart'), { tone: 'success' });
  };

  return (
    <li
      data-testid="product-card"
      className={cx(
        'group relative flex',
        isGrid ? 'flex-col' : 'flex-row gap-4 border-b border-hairline pb-4',
      )}
    >
      <Link
        href={`/${locale}/products/${product.slug}`}
        className="absolute inset-0 z-[1] rounded-image focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={product.name}
        data-testid="product-link"
      />

      <div
        className={cx(
          'relative overflow-hidden rounded-image bg-surface',
          isGrid ? 'aspect-product w-full' : 'aspect-product w-28 shrink-0',
        )}
      >
        {product.image !== null && !imgError ? (
          // H-30: use the server-generated AVIF/WebP srcsets so the browser picks the best format
          // and size instead of always downloading the 1024px WebP fallback.
          <picture className="absolute inset-0 h-full w-full">
            <source
              type="image/avif"
              srcSet={product.image.srcset.avif}
              sizes={isGrid ? GRID_SIZES : LIST_SIZES}
            />
            <source
              type="image/webp"
              srcSet={product.image.srcset.webp}
              sizes={isGrid ? GRID_SIZES : LIST_SIZES}
            />
            <img
              src={product.image.src}
              alt={product.image.alt || product.name}
              className={cx(
                'h-full w-full object-cover transition-transform duration-normal ease-out motion-safe:group-hover:scale-[1.03]',
                !product.inStock && 'opacity-60',
              )}
              onError={handleImgError}
            />
          </picture>
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full items-center justify-center font-display text-h1 text-hairline"
          >
            {product.name.charAt(0)}
          </div>
        )}

        {(onSale || !product.inStock || product.lowStock) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 rounded-control bg-surface/90 px-2 py-1">
            {onSale && <Badge tone="critical">{t('sale')}</Badge>}
            {!product.inStock && <Badge tone="muted">{t('outOfStock')}</Badge>}
            {product.inStock && product.lowStock && <Badge tone="default">{t('fewLeft')}</Badge>}
          </div>
        )}
      </div>

      <div className={cx('flex flex-col gap-1 pt-3', !isGrid && 'flex-1 justify-center pt-0')}>
        <span className="text-base font-medium text-text line-clamp-2">{product.name}</span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Price amount={product.priceFrom} compareAt={product.compareAtFrom} size="md" />
          {percent !== null && (
            <span className="text-caption font-semibold text-success">
              {t('percentOff', { percent })}
            </span>
          )}
        </div>
        {rating.count > 0 && (
          <span
            className="inline-flex items-center gap-1 text-caption text-muted"
            aria-label={t('ratingLabel', { avg: rating.avg.toFixed(1), count: rating.count })}
          >
            <Icon name="star" size={16} className="text-warning" />
            <span aria-hidden="true">
              {rating.avg.toFixed(1)} ({rating.count})
            </span>
          </span>
        )}

        <div className={cx('relative z-10 mt-2', !isGrid && 'max-w-xs')}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            disabled={!canAdd}
            onClick={handleAddToCart}
            icon="bag"
          >
            {product.inStock ? t('addToCart') : t('outOfStock')}
          </Button>
        </div>
      </div>
    </li>
  );
}
