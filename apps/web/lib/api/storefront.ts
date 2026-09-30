import 'server-only';

import { type PublicSettings, SETTING_DEFAULTS, toPublicSettings } from '@pe/shared';

import { REVALIDATE, COLLECTION_PAGE_SIZE } from '@/lib/catalogue/constants';
import type { CollectionParams } from '@/lib/catalogue/params';
import { rupeesToPaise } from '@/lib/catalogue/params';

import { apiGet } from './server';
import type {
  CategoryNode,
  PaginationMeta,
  ProductDetailDto,
  ProductSummaryDto,
  SearchResultDto,
} from './types';

/** Tags the API revalidates (apps/api/src/modules/revalidate/tags.ts) plus `settings` for the public subset. */
export const CACHE_TAGS = {
  home: 'home',
  categories: 'categories',
  search: 'search',
  settings: 'settings',
  products: 'products',
  product: (slug: string) => `product:${slug}`,
  category: (slug: string) => `category:${slug}`,
} as const;

const CATEGORIES_REVALIDATE_SECONDS = 300;
const SETTINGS_REVALIDATE_SECONDS = 60;

/** What the shell shows when the API cannot be reached: brand defaults, no announcement bar. */
export const OFFLINE_SETTINGS: PublicSettings = {
  ...toPublicSettings(SETTING_DEFAULTS),
  announcementBar: { enabled: false, text: '' },
};

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const warnUnavailable = (what: string, error: unknown): void => {
  console.warn(`[storefront] ${what} unavailable, rendering fallback — ${describe(error)}`);
};

export const getCategoryTree = async (): Promise<readonly CategoryNode[]> => {
  try {
    const result = await apiGet<readonly CategoryNode[]>('/categories', {
      tags: [CACHE_TAGS.categories],
      revalidate: CATEGORIES_REVALIDATE_SECONDS,
    });
    return result.data;
  } catch (error) {
    warnUnavailable('categories', error);
    return [];
  }
};

export const getPublicSettings = async (): Promise<PublicSettings> => {
  try {
    const result = await apiGet<PublicSettings>('/settings/public', {
      tags: [CACHE_TAGS.settings, CACHE_TAGS.home],
      revalidate: SETTINGS_REVALIDATE_SECONDS,
    });
    return result.data;
  } catch (error) {
    warnUnavailable('public settings', error);
    return OFFLINE_SETTINGS;
  }
};

export interface ProductListResult {
  readonly products: readonly ProductSummaryDto[];
  readonly meta: PaginationMeta;
}

export const getFeaturedProducts = async (limit = 12): Promise<readonly ProductSummaryDto[]> => {
  try {
    const result = await apiGet<readonly ProductSummaryDto[]>(
      `/products?limit=${limit}`,
      // H-29: include `products` tag so any product update also busts this list
      { tags: [CACHE_TAGS.home, CACHE_TAGS.products], revalidate: REVALIDATE.home },
    );
    return result.data;
  } catch (error) {
    warnUnavailable('featured products', error);
    return [];
  }
};

export const getCollectionProducts = async (
  slug: string,
  params: Partial<CollectionParams> = {},
): Promise<ProductListResult> => {
  const { sort = 'featured', min = 0, max = 0, page = 1, view: _view } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(COLLECTION_PAGE_SIZE) });
  if (sort !== 'featured') qs.set('sort', sort);
  if (min > 0) qs.set('minPrice', String(rupeesToPaise(min)));
  if (max > 0) qs.set('maxPrice', String(rupeesToPaise(max)));
  const result = await apiGet<readonly ProductSummaryDto[]>(
    `/categories/${encodeURIComponent(slug)}/products?${qs}`,
    { tags: [CACHE_TAGS.category(slug)], revalidate: REVALIDATE.collection },
  );
  return { products: result.data, meta: result.meta ?? { page, limit: COLLECTION_PAGE_SIZE, total: 0 } };
};

export const getProductDetail = async (slug: string): Promise<ProductDetailDto | null> => {
  try {
    const result = await apiGet<ProductDetailDto>(`/products/${encodeURIComponent(slug)}`, {
      tags: [CACHE_TAGS.product(slug)],
      revalidate: REVALIDATE.pdp,
    });
    return result.data;
  } catch (error) {
    warnUnavailable(`product ${slug}`, error);
    return null;
  }
};

export const getAllProducts = async (
  params: Partial<CollectionParams> = {},
): Promise<ProductListResult> => {
  const { sort = 'featured', min = 0, max = 0, page = 1 } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(COLLECTION_PAGE_SIZE) });
  if (sort !== 'featured') qs.set('sort', sort);
  if (min > 0) qs.set('minPrice', String(rupeesToPaise(min)));
  if (max > 0) qs.set('maxPrice', String(rupeesToPaise(max)));
  const result = await apiGet<readonly ProductSummaryDto[]>(
    `/products?${qs}`,
    { tags: [CACHE_TAGS.home], revalidate: REVALIDATE.collection },
  );
  return { products: result.data, meta: result.meta ?? { page, limit: COLLECTION_PAGE_SIZE, total: 0 } };
};

export const searchProducts = async (q: string): Promise<SearchResultDto> => {
  try {
    const result = await apiGet<SearchResultDto>(
      `/search?q=${encodeURIComponent(q)}&limit=6`,
      // H-28: was `{ revalidate: false }` with no tags — cached indefinitely with no bust path
      { tags: [CACHE_TAGS.search], revalidate: 60 },
    );
    return result.data;
  } catch (error) {
    warnUnavailable('search', error);
    return { products: [], categories: [] };
  }
};
