import { describe, expect, it } from 'vitest';

import type { ProductSummaryDto } from '@/lib/api/types';

import { featuredFirst } from './featured';

const product = (slug: string, isFeatured: boolean): ProductSummaryDto => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  categorySlug: 'agarbatti',
  defaultVariantId: `v-${slug}`,
  priceFrom: 8000,
  compareAtFrom: null,
  image: null,
  isFeatured,
  inStock: true,
  lowStock: false,
  ratingSummary: { avg: 0, count: 0 },
});

describe('featuredFirst', () => {
  it('puts featured products first, keeps API order within each group and caps at the limit', () => {
    const products = [
      product('a', false),
      product('b', true),
      product('c', false),
      product('d', true),
      product('e', false),
    ];

    expect(featuredFirst(products, 4).map((p) => p.slug)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('returns everything when fewer than the limit and nothing for a non-positive limit', () => {
    const products = [product('a', false), product('b', true)];

    expect(featuredFirst(products, 8).map((p) => p.slug)).toEqual(['b', 'a']);
    expect(featuredFirst(products, 0)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const products = [product('a', false), product('b', true)];
    const snapshot = [...products];

    featuredFirst(products, 1);

    expect(products).toEqual(snapshot);
  });
});
