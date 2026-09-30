/** ISR revalidation periods in seconds.
 * All values live here so P18 Lighthouse-CI can assert them in one place. */
export const REVALIDATE = {
  home: 3600,
  collection: 900,
  pdp: 900,
  settings: 60,
  categories: 300,
} as const;

export const COLLECTION_PAGE_SIZE = 24;
export const HOME_FEATURED_LIMIT = 8;
export const RELATED_LIMIT = 8;
export const SEARCH_AUTOCOMPLETE_LIMIT = 6;
export const QUANTITY_MAX_CART = 20;
export const FREE_SHIPPING_DEFAULT_THRESHOLD_PAISE = 0;
