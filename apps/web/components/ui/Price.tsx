import { useTranslations } from 'next-intl';

import { formatPrice } from '@/lib/format';

import { cx } from './cx';
import { VisuallyHidden } from './VisuallyHidden';

export type PriceSize = 'sm' | 'md' | 'lg';

const SIZES: Readonly<Record<PriceSize, string>> = {
  sm: 'text-small',
  md: 'text-base',
  lg: 'text-h3',
};

interface PriceProps {
  /** Integer paise. */
  readonly amount: number;
  /** Integer paise; rendered struck through when higher than `amount`. */
  readonly compareAt?: number | null;
  readonly size?: PriceSize;
}

/** `₹80.00` in tabular figures with Indian grouping; on sale, "Sale price"/"Regular price" for screen readers. */
export function Price({ amount, compareAt = null, size = 'md' }: PriceProps) {
  const t = useTranslations('a11y');
  const onSale = compareAt !== null && compareAt > amount;
  return (
    <span
      className={cx('inline-flex items-baseline gap-2 tabular-nums', SIZES[size])}
      data-testid="price"
    >
      <span className="font-medium text-text">
        {onSale && <VisuallyHidden>{t('salePrice')} </VisuallyHidden>}
        {formatPrice(amount)}
      </span>
      {onSale && (
        <s className="text-small font-normal text-muted" data-testid="price-compare-at">
          <VisuallyHidden>{t('regularPrice')} </VisuallyHidden>
          {formatPrice(compareAt)}
        </s>
      )}
    </span>
  );
}
