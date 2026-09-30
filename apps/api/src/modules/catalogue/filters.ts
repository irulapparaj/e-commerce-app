import { slugSchema } from '@pe/shared';
import { z } from 'zod';

/** `bestselling` arrives with sales data in P25; until then `featured` is the storefront default. */
export const COLLECTION_SORTS = ['featured', 'newest', 'price_asc', 'price_desc'] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export const COLLECTION_LIMIT_MIN = 12;
export const COLLECTION_LIMIT_MAX = 48;
export const COLLECTION_LIMIT_DEFAULT = 24;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_MAX = 20;
const SEARCH_LIMIT_DEFAULT = 10;
const PRICE_MAX_PAISE = 1_000_000_000;

const paise = z.coerce.number().int().min(0).max(PRICE_MAX_PAISE);

export const collectionQuerySchema = z
  .strictObject({
    sort: z.enum(COLLECTION_SORTS).default('featured'),
    minPrice: paise.optional(),
    maxPrice: paise.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(COLLECTION_LIMIT_MIN)
      .max(COLLECTION_LIMIT_MAX)
      .default(COLLECTION_LIMIT_DEFAULT),
  })
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] },
  );

export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

export const productListQuerySchema = collectionQuerySchema;

export const slugParamsSchema = z.strictObject({ slug: slugSchema });

export const SEARCH_TYPES = ['products', 'categories', 'all'] as const;

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(SEARCH_QUERY_MAX),
  type: z.enum(SEARCH_TYPES).default('all'),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
