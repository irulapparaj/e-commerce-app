import { z } from 'zod';

export const SORT_OPTIONS = ['featured', 'price_asc', 'price_desc', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: SortOption = 'featured';
export const DEFAULT_VIEW = 'grid' as const;

/** Tolerant: invalid values silently fall back to defaults — no 400 on a page route. */
export const collectionParamsSchema = z.object({
  sort: z.enum(SORT_OPTIONS).catch(DEFAULT_SORT),
  /** Rupees in URL; converted to paise for the API. */
  min: z.coerce
    .number()
    .int()
    .nonnegative()
    .catch(0)
    .transform((r) => r),
  /** Rupees in URL; 0 means no upper bound. */
  max: z.coerce
    .number()
    .int()
    .nonnegative()
    .catch(0)
    .transform((r) => r),
  page: z.coerce.number().int().min(1).catch(1),
  view: z.enum(['grid', 'list']).catch(DEFAULT_VIEW),
});

export type CollectionParams = z.infer<typeof collectionParamsSchema>;

/** Rupees → paise for the API. 0 stays 0 (means "no bound"). */
export const rupeesToPaise = (rupees: number): number => rupees * 100;

/** Paise → rupees for the URL (integer rupees only). */
export const paiseToRupees = (paise: number): number => Math.floor(paise / 100);

export const parseCollectionParams = (raw: Record<string, string | string[] | undefined>): CollectionParams => {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }
  return collectionParamsSchema.parse(flat);
};
