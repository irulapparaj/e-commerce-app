import { formatINR } from '@pe/shared/money';

const CART_BADGE_MAX = 99;

/** `₹1,23,456.00` — integer paise in, Indian grouping out (packages/shared/money). */
export const formatPrice = (paise: number): string => formatINR(paise);

export const formatCount = (value: number): string => new Intl.NumberFormat('en-IN').format(value);

/** The header badge stays two characters wide. */
export const formatCartCount = (count: number): string =>
  count > CART_BADGE_MAX ? `${CART_BADGE_MAX}+` : String(Math.max(0, Math.trunc(count)));

/** `₹599` for whole-rupee amounts, `₹599.50` otherwise: thresholds and trust copy, not line items. */
export const formatWholeRupees = (paise: number): string => formatPrice(paise).replace(/\.00$/, '');

/** Whole-number saving against the compare-at price; `null` when there is no real discount. */
export const discountPercent = (paise: number, compareAtPaise: number | null): number | null => {
  if (compareAtPaise === null || compareAtPaise <= 0 || compareAtPaise <= paise) return null;
  const percent = Math.round(((compareAtPaise - paise) / compareAtPaise) * 100);
  return percent >= 1 ? percent : null;
};

export { formatINR };
