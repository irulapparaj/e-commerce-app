import type { PriceRange } from '@pe/shared';

/** Rupees. Slider bounds derived from the API's paise `meta.priceRange`. */
export interface RupeeBounds {
  readonly min: number;
  readonly max: number;
}

/** Bounds plus the density histogram drawn above the slider. */
export interface PriceSpread extends RupeeBounds {
  readonly buckets: readonly number[];
}

/** Widens paise bounds to whole rupees (floor/ceil) so every product stays inside the slider. */
export const boundsToRupees = (range: PriceRange | null | undefined): PriceSpread | null => {
  if (range === null || range === undefined) return null;
  const min = Math.floor(range.min / 100);
  const max = Math.ceil(range.max / 100);
  return max > min ? { min, max, buckets: range.buckets ?? [] } : null;
};

const STEP_TIERS: readonly (readonly [number, number])[] = [
  [5000, 100],
  [2000, 50],
  [500, 10],
];

/** A keyboard-friendly slider step: coarse on wide ranges, ₹1 on narrow ones. */
export const sliderStep = (bounds: RupeeBounds): number => {
  const range = bounds.max - bounds.min;
  for (const [threshold, step] of STEP_TIERS) {
    if (range >= threshold) return step;
  }
  return 1;
};

export const clampToBounds = (value: number, bounds: RupeeBounds): number =>
  Math.min(Math.max(value, bounds.min), bounds.max);

/**
 * URL params (0 = unset) → slider thumb positions. An unset min sits on the lower bound, an unset
 * max on the upper; values typed beyond the bounds clamp for display only.
 */
export const thumbsFor = (
  min: number,
  max: number,
  bounds: RupeeBounds,
): { readonly lo: number; readonly hi: number } => {
  const lo = min > 0 ? clampToBounds(min, bounds) : bounds.min;
  const hi = max > 0 ? clampToBounds(max, bounds) : bounds.max;
  return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
};

/** Thumb positions → URL params: a thumb resting on its bound means "no filter" (0). */
export const paramsForThumbs = (
  lo: number,
  hi: number,
  bounds: RupeeBounds,
): { readonly min: number; readonly max: number } => ({
  min: lo > bounds.min ? lo : 0,
  max: hi < bounds.max ? hi : 0,
});
