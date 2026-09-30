import type { ProductSummaryDto } from '@/lib/api/types';

/**
 * Home "Best sellers": merchandised (`isFeatured`) products lead, the rest fill in API order, capped
 * at `limit`. The API's smallest page is larger than the home grid, so the cut happens here.
 */
export const featuredFirst = (
  products: readonly ProductSummaryDto[],
  limit: number,
): readonly ProductSummaryDto[] => {
  if (limit <= 0) return [];
  const featured = products.filter((product) => product.isFeatured);
  const rest = products.filter((product) => !product.isFeatured);
  return [...featured, ...rest].slice(0, limit);
};
