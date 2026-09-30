/**
 * Locale-aware URL builders for the storefront catalogue (W1 fix).
 *
 * next-intl is configured with `localePrefix: 'as-needed'`, which means the
 * default locale (`en`) omits the prefix.  Generating `/en/products/foo` would
 * trigger a 307 redirect to `/products/foo` on every navigation.  Use
 * `localePath` instead of building `/${locale}/...` manually.
 */

import type { CollectionParams } from './params';
import { DEFAULT_SORT, DEFAULT_VIEW } from './params';

/** The default locale that next-intl omits from URLs (matches `routing.defaultLocale`). */
export const DEFAULT_LOCALE = 'en' as const;

/**
 * Returns a locale-prefixed path that matches `localePrefix: 'as-needed'`.
 * For the default locale the prefix is omitted.
 *
 * @example
 *   localePath('en', '/products/t-shirt') // → '/products/t-shirt'
 *   localePath('hi', '/products/t-shirt') // → '/hi/products/t-shirt'
 */
export const localePath = (locale: string, path: string): string =>
  locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;

/**
 * URL for a product detail page.
 *
 * @example
 *   productUrl('en', 'classic-tee') // → '/products/classic-tee'
 *   productUrl('hi', 'classic-tee') // → '/hi/products/classic-tee'
 */
export const productUrl = (locale: string, slug: string): string =>
  localePath(locale, `/products/${slug}`);

/**
 * URL for a collection listing page.
 *
 * @example
 *   collectionUrl('en', 'summer-sale') // → '/collections/summer-sale'
 *   collectionUrl('hi', 'summer-sale') // → '/hi/collections/summer-sale'
 */
export const collectionUrl = (locale: string, slug: string): string =>
  localePath(locale, `/collections/${slug}`);

/**
 * URL for a category listing page.
 *
 * @example
 *   categoryUrl('en', 'men') // → '/categories/men'
 *   categoryUrl('hi', 'men') // → '/hi/categories/men'
 */
export const categoryUrl = (locale: string, slug: string): string =>
  localePath(locale, `/categories/${slug}`);

/** Serialise CollectionParams to a query string, omitting default/zero values. */
const toQueryString = (params: CollectionParams): string => {
  const q = new URLSearchParams();
  if (params.sort !== DEFAULT_SORT) q.set('sort', params.sort);
  if (params.min > 0) q.set('min', String(params.min));
  if (params.max > 0) q.set('max', String(params.max));
  if (params.page > 1) q.set('page', String(params.page));
  if (params.view !== DEFAULT_VIEW) q.set('view', params.view);
  const qs = q.toString();
  return qs ? `?${qs}` : '';
};

/**
 * URL for a collection listing page with filter params.
 */
export const buildCollectionUrl = (locale: string, slug: string, params: CollectionParams): string =>
  localePath(locale, `/collections/${slug}${toQueryString(params)}`);

/**
 * URL for the all-products listing page (no specific collection slug) with filter params.
 */
export const buildAllProductsUrl = (locale: string, params: CollectionParams): string =>
  localePath(locale, `/collections${toQueryString(params)}`);

/** Alias for `productUrl` used by product detail pages. */
export const buildProductUrl = productUrl;

/** Alias for `categoryUrl` used by category listing pages. */
export const buildCategoryUrl = categoryUrl;

/** URL for a search results page with a query string. */
export const buildSearchUrl = (locale: string, q: string): string =>
  localePath(locale, `/search?q=${encodeURIComponent(q)}`);
