import { describe, expect, it, vi } from 'vitest';

import type { JobQueue } from '../../jobs/queue';

import { createRevalidateNotifier } from './notify';
import { categoryTag, productTag, tagsForCategory, tagsForProduct } from './tags';

describe('revalidation tags', () => {
  it('derives product tags including parent category, search and home always (H-29)', () => {
    expect(
      tagsForProduct({
        slug: 'kapur',
        categorySlug: 'camphor',
        parentCategorySlug: 'puja-samagri',
        isFeatured: true,
      }),
    ).toEqual(['product:kapur', 'category:camphor', 'category:puja-samagri', 'search', 'home']);
    // H-29: home tag is always included so non-featured updates also bust the featured product list
    expect(tagsForProduct({ slug: 'kapur', categorySlug: 'camphor' })).toEqual([
      'product:kapur',
      'category:camphor',
      'search',
      'home',
    ]);
    expect(tagsForCategory('camphor', 'puja-samagri')).toEqual([
      'categories',
      'category:camphor',
      'category:puja-samagri',
      'home',
    ]);
    expect(tagsForCategory('agarbatti', null)).toEqual([
      'categories',
      'category:agarbatti',
      'home',
    ]);
    expect(productTag('a')).toBe('product:a');
    expect(categoryTag('b')).toBe('category:b');
  });

  it('notifier de-duplicates and sorts tags and skips empty lists', async () => {
    const send = vi.fn(async () => 'job-1');
    const jobs = { send } as unknown as JobQueue;
    const notifier = createRevalidateNotifier(jobs);

    expect(await notifier.notify(['home', 'product:a', 'home'])).toBe('job-1');
    expect(send).toHaveBeenCalledWith('revalidate', { tags: ['home', 'product:a'] });
    expect(await notifier.notify([])).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
