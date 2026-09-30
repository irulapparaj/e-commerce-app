import { SETTING_DEFAULTS } from '@pe/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { categoryTree, publicSettings } from '@/test-utils/storefront';

import { ApiError } from './envelope';

const apiGet = vi.fn<(path: string, options: unknown) => Promise<unknown>>();
vi.mock('server-only', () => ({}));
vi.mock('./server', () => ({
  apiGet: (path: string, options: unknown) => apiGet(path, options),
}));

const {
  CACHE_TAGS,
  getCategoryTree,
  getPublicSettings,
  OFFLINE_SETTINGS,
  getFeaturedProducts,
  getCollectionProducts,
  getProductDetail,
  searchProducts,
} = await import('./storefront');

describe('storefront loaders', () => {
  beforeEach(() => {
    apiGet.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds tags matching the API revalidation scheme', () => {
    expect(CACHE_TAGS.product('kapur')).toBe('product:kapur');
    expect(CACHE_TAGS.category('dhoop')).toBe('category:dhoop');
    expect([
      CACHE_TAGS.home,
      CACHE_TAGS.categories,
      CACHE_TAGS.search,
      CACHE_TAGS.settings,
    ]).toEqual(['home', 'categories', 'search', 'settings']);
  });

  it('loads the category tree with the categories tag', async () => {
    apiGet.mockResolvedValueOnce({ data: categoryTree });

    expect(await getCategoryTree()).toBe(categoryTree);
    expect(apiGet).toHaveBeenCalledWith('/categories', { tags: ['categories'], revalidate: 300 });
  });

  it('loads public settings tagged settings and home', async () => {
    apiGet.mockResolvedValueOnce({ data: publicSettings });

    expect(await getPublicSettings()).toBe(publicSettings);
    expect(apiGet).toHaveBeenCalledWith('/settings/public', {
      tags: ['settings', 'home'],
      revalidate: 60,
    });
  });

  it('degrades to an empty nav and no announcement bar when the API is unreachable', async () => {
    apiGet.mockRejectedValueOnce(new TypeError('fetch failed'));
    apiGet.mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 503, 'down'));

    expect(await getCategoryTree()).toEqual([]);
    const settings = await getPublicSettings();

    expect(settings).toEqual(OFFLINE_SETTINGS);
    expect(settings.announcementBar).toEqual({ enabled: false, text: '' });
    expect(settings.brand).toEqual(SETTING_DEFAULTS.brand);
    expect(settings.pickupLocation.city).toBe(SETTING_DEFAULTS.pickup_location.city);
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('TypeError: fetch failed');
  });

  it('describes non-Error rejections too', async () => {
    apiGet.mockRejectedValueOnce('boom');
    await getCategoryTree();
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('boom');
  });

  it('getFeaturedProducts returns products array', async () => {
    const products = [{ id: 'p1', slug: 'kapur', name: 'Kapur' }];
    apiGet.mockResolvedValueOnce({ data: products });
    const result = await getFeaturedProducts(4);
    expect(result).toBe(products);
    expect(apiGet).toHaveBeenCalledWith('/products?limit=4', expect.objectContaining({ tags: expect.arrayContaining(['home']) }));
  });

  it('getFeaturedProducts returns empty array on error', async () => {
    apiGet.mockRejectedValueOnce(new Error('offline'));
    const result = await getFeaturedProducts();
    expect(result).toEqual([]);
  });

  it('getCollectionProducts returns products and meta', async () => {
    const products = [{ id: 'p2', slug: 'agarbatti', name: 'Agarbatti' }];
    const meta = { page: 1, limit: 24, total: 1 };
    apiGet.mockResolvedValueOnce({ data: products, meta });
    const result = await getCollectionProducts('incense', { sort: 'featured', min: 0, max: 0, page: 1, view: 'grid' });
    expect(result.products).toBe(products);
    expect(result.meta).toEqual(meta);
  });

  it('getCollectionProducts rethrows ApiError', async () => {
    const { ApiError } = await import('./envelope');
    apiGet.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404, 'not found'));
    await expect(getCollectionProducts('missing', { sort: 'featured', min: 0, max: 0, page: 1, view: 'grid' }))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('getProductDetail returns product detail', async () => {
    const detail = { id: 'p3', slug: 'camphor', name: 'Camphor' };
    apiGet.mockResolvedValueOnce({ data: detail });
    const result = await getProductDetail('camphor');
    expect(result).toBe(detail);
  });

  it('getProductDetail returns null on 404', async () => {
    const { ApiError } = await import('./envelope');
    apiGet.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404, 'not found'));
    const result = await getProductDetail('does-not-exist');
    expect(result).toBeNull();
  });

  it('searchProducts returns results', async () => {
    const results = { products: [], categories: [] };
    apiGet.mockResolvedValueOnce({ data: results });
    const result = await searchProducts('camphor');
    expect(result).toBe(results);
  });

  it('searchProducts returns empty results on error', async () => {
    apiGet.mockRejectedValueOnce(new Error('offline'));
    const result = await searchProducts('camphor');
    expect(result).toEqual({ products: [], categories: [] });
  });
});
