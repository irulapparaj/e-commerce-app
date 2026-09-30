/** Cache tags shared with the storefront's `fetch(..., { next: { tags } })` calls (P04 task 10). */
export const HOME_TAG = 'home';
export const CATEGORIES_TAG = 'categories';
export const SEARCH_TAG = 'search';
/** The storefront shell's `GET /settings/public` fetch (P09). */
export const SETTINGS_TAG = 'settings';

export const productTag = (slug: string): string => `product:${slug}`;
export const categoryTag = (slug: string): string => `category:${slug}`;

export interface ProductTagInput {
  readonly slug: string;
  readonly categorySlug: string;
  readonly parentCategorySlug?: string | null | undefined;
  readonly isFeatured?: boolean;
}

/** A product change touches its page, its category pages, search and the home page (H-29). */
export const tagsForProduct = (input: ProductTagInput): readonly string[] =>
  [
    productTag(input.slug),
    categoryTag(input.categorySlug),
    ...(input.parentCategorySlug ? [categoryTag(input.parentCategorySlug)] : []),
    SEARCH_TAG,
    // H-29: always include HOME_TAG so non-featured product updates also bust the featured list
    HOME_TAG,
  ].filter((tag, index, all) => all.indexOf(tag) === index);

export const tagsForCategory = (slug: string, parentSlug?: string | null): readonly string[] => [
  CATEGORIES_TAG,
  categoryTag(slug),
  ...(parentSlug ? [categoryTag(parentSlug)] : []),
  HOME_TAG,
];
