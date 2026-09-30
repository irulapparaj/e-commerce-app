import { describe, expect, it } from 'vitest';

import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lower-cases, transliterates accents and collapses separators', () => {
    expect(slugify('Pure Camphor Tablets')).toBe('pure-camphor-tablets');
    expect(slugify('Crème Brûlée & Café')).toBe('creme-brulee-cafe');
    expect(slugify('  Loban   Dhoop -- Jar  ')).toBe('loban-dhoop-jar');
    expect(slugify('Aroma Oils (Bulb)')).toBe('aroma-oils-bulb');
  });

  it('never returns an empty slug and caps the length', () => {
    expect(slugify('!!!')).toBe('item');
    expect(slugify('a'.repeat(300))).toHaveLength(100);
    expect(slugify('x'.repeat(99) + '-y')).not.toMatch(/-$/);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free and appends a numeric suffix on collisions', async () => {
    const taken = new Set(['kapur', 'kapur-2']);
    const exists = async (slug: string) => taken.has(slug);

    expect(await uniqueSlug('camphor', exists)).toBe('camphor');
    expect(await uniqueSlug('kapur', exists)).toBe('kapur-3');
  });

  it('falls back to a random suffix after fifty sequential collisions', async () => {
    const result = await uniqueSlug('busy', async () => true);

    expect(result).toMatch(/^busy-[0-9a-f]{6}$/);
  });
});
