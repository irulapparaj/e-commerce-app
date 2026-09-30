import { describe, expect, it } from 'vitest';

import {
  categoryUrl,
  collectionUrl,
  DEFAULT_LOCALE,
  localePath,
  productUrl,
} from './urls';

describe('localePath', () => {
  it('omits the prefix for the default locale (en)', () => {
    expect(localePath('en', '/products/t-shirt')).toBe('/products/t-shirt');
  });

  it('prepends the locale prefix for non-default locales', () => {
    expect(localePath('hi', '/products/t-shirt')).toBe('/hi/products/t-shirt');
  });

  it('handles the root path for the default locale', () => {
    expect(localePath('en', '/')).toBe('/');
  });

  it('handles the root path for a non-default locale', () => {
    expect(localePath('hi', '/')).toBe('/hi/');
  });
});

describe('productUrl', () => {
  it('returns a path without locale prefix for default locale', () => {
    expect(productUrl(DEFAULT_LOCALE, 'classic-tee')).toBe('/products/classic-tee');
  });

  it('returns a locale-prefixed path for non-default locale', () => {
    expect(productUrl('hi', 'classic-tee')).toBe('/hi/products/classic-tee');
  });

  it('does NOT produce a /en/ prefix (which would trigger a 307 redirect)', () => {
    expect(productUrl('en', 'some-slug')).not.toContain('/en/');
  });
});

describe('collectionUrl', () => {
  it('returns a path without locale prefix for default locale', () => {
    expect(collectionUrl(DEFAULT_LOCALE, 'summer-sale')).toBe('/collections/summer-sale');
  });

  it('returns a locale-prefixed path for non-default locale', () => {
    expect(collectionUrl('hi', 'summer-sale')).toBe('/hi/collections/summer-sale');
  });
});

describe('categoryUrl', () => {
  it('returns a path without locale prefix for default locale', () => {
    expect(categoryUrl(DEFAULT_LOCALE, 'men')).toBe('/categories/men');
  });

  it('returns a locale-prefixed path for non-default locale', () => {
    expect(categoryUrl('hi', 'men')).toBe('/hi/categories/men');
  });
});
