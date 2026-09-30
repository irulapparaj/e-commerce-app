import { describe, expect, it } from 'vitest';

import { collectionQuerySchema, searchQuerySchema, slugParamsSchema } from './filters';

describe('collectionQuerySchema', () => {
  it('applies defaults', () => {
    expect(collectionQuerySchema.parse({})).toEqual({ sort: 'featured', page: 1, limit: 24 });
  });

  it('coerces and bounds numeric params', () => {
    expect(
      collectionQuerySchema.parse({ page: '3', limit: '48', minPrice: '100', maxPrice: '5000' }),
    ).toMatchObject({ page: 3, limit: 48, minPrice: 100, maxPrice: 5000 });
    expect(collectionQuerySchema.safeParse({ limit: '11' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ limit: '49' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ minPrice: '10.5' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ minPrice: '-1' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(
      false,
    );
  });

  it('rejects unknown sorts and unknown keys', () => {
    expect(collectionQuerySchema.safeParse({ sort: 'bestselling' }).success).toBe(false);
    expect(collectionQuerySchema.safeParse({ sort: 'price_asc' }).success).toBe(true);
    expect(collectionQuerySchema.safeParse({ colour: 'red' }).success).toBe(false);
  });
});

describe('slug and search params', () => {
  it('rejects traversal and encoded traversal in slugs', () => {
    expect(slugParamsSchema.safeParse({ slug: 'pure-camphor' }).success).toBe(true);
    expect(slugParamsSchema.safeParse({ slug: '../etc' }).success).toBe(false);
    expect(slugParamsSchema.safeParse({ slug: '..' }).success).toBe(false);
    expect(slugParamsSchema.safeParse({ slug: 'a%2e%2e' }).success).toBe(false);
    expect(slugParamsSchema.safeParse({ slug: 'A' }).success).toBe(false);
  });

  it('requires a non-empty query capped at 100 chars', () => {
    expect(searchQuerySchema.parse({ q: ' kapur ' })).toEqual({
      q: 'kapur',
      type: 'all',
      limit: 10,
    });
    expect(searchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x', type: 'blog' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x', limit: '21' }).success).toBe(false);
  });
});
