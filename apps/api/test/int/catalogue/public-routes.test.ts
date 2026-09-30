import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CATEGORY_TREE_CACHE_KEY } from '../../../src/modules/catalogue/tree';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory, createProduct, doc, envelope, SYSTEM } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

interface Summary {
  readonly slug: string;
  readonly priceFrom: number;
  readonly inStock: boolean;
  readonly lowStock: boolean;
  readonly image: { src: string; srcset: { webp: string; avif: string } } | null;
}

describe('public catalogue routes', () => {
  let testApp: TestApp;
  let categoryId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
  });

  const get = (url: string, headers: Record<string, string> = {}) =>
    testApp.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });

  describe('GET /categories', () => {
    it('returns the two-level tree, serves the second call from cache and invalidates after a write', async () => {
      const first = await get('/categories');
      const tree = envelope<{ slug: string; children: { slug: string }[] }[]>(first).data;
      const cached = await testApp.valkey.get(CATEGORY_TREE_CACHE_KEY);
      await getPrisma().category.create({ data: { name: 'Hidden', slug: 'hidden-direct-insert' } });
      const stillCached = envelope<{ slug: string }[]>(await get('/categories')).data;
      await createCategory(testApp, 'Diyas');
      const refreshed = envelope<{ slug: string }[]>(await get('/categories')).data;

      expect(first.statusCode).toBe(200);
      expect(tree.map((node) => node.slug)).toEqual(['agarbatti']);
      expect(tree[0]?.children.length).toBe(13);
      expect(tree[0]?.children[0]).toMatchObject({
        slug: 'agarbatti-bambooless',
        name: 'Bambooless',
        imageUrl: null,
        children: [],
      });
      expect(cached).not.toBeNull();
      expect(stillCached.map((node) => node.slug)).toEqual(['agarbatti']);
      expect(refreshed.map((node) => node.slug).sort()).toEqual([
        'agarbatti',
        'diyas',
        'hidden-direct-insert',
      ]);
    });
  });

  describe('GET /categories/:slug/products and /products', () => {
    it('paginates with meta, sorts by price, filters by price and excludes inactive products', async () => {
      const prices = [500, 300, 900, 100];
      for (const [index, price] of prices.entries())
        await createProduct(testApp, { name: `Sorted ${index}`, categoryId, price, stock: 5 });
      await createProduct(testApp, {
        name: 'Draft item',
        categoryId,
        price: 50,
        stock: 5,
        active: false,
      });

      const asc = await get('/categories/agarbatti/products?sort=price_asc&limit=12');
      const page2 = await get('/categories/agarbatti/products?sort=price_asc&limit=12&page=2');
      const filtered = await get('/products?minPrice=300&maxPrice=500&sort=price_desc');
      const bad = await get('/categories/agarbatti/products?sort=bestselling');
      const unknown = await get('/categories/does-not-exist/products');

      const ascPrices = envelope<Summary[]>(asc).data.map((item) => item.priceFrom);
      expect(asc.statusCode).toBe(200);
      expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
      expect(ascPrices).not.toContain(50);
      const ascMeta = envelope(asc).meta;
      expect(ascMeta).toMatchObject({ page: 1, limit: 12, total: 6 });
      // Bounds span the seeded catalogue (Bambooless default variant at 12000 paise) and ignore
      // the inactive 50-paise draft.
      expect(ascMeta?.priceRange).toMatchObject({ min: 100, max: 12000 });
      // Histogram: 20 equal buckets of width 595 paise over [100, 12000]. 100/300/500 land in the
      // first bar, 900 in the second, 8000 in the fourteenth, and the exact maximum folds into
      // the last instead of width_bucket's overflow bucket.
      const buckets = ascMeta?.priceRange?.buckets ?? [];
      expect(buckets).toHaveLength(20);
      expect(buckets.reduce((sum, count) => sum + count, 0)).toBe(6);
      expect(buckets[0]).toBe(3);
      expect(buckets[1]).toBe(1);
      expect(buckets[13]).toBe(1);
      expect(buckets[19]).toBe(1);
      expect(envelope<Summary[]>(page2).data).toEqual([]);
      expect(envelope(page2).meta).toMatchObject({ page: 2, limit: 12, total: 6 });
      expect(envelope<Summary[]>(filtered).data.map((item) => item.priceFrom)).toEqual([500, 300]);
      // priceRange stays the unfiltered spread so slider bounds do not chase the filter.
      expect(envelope(filtered).meta?.priceRange).toEqual(envelope(asc).meta?.priceRange);
      expect(bad.statusCode).toBe(400);
      expect(envelope(bad).error?.code).toBe('VALIDATION');
      expect(unknown.statusCode).toBe(404);
    });

    it('lists child-category products under the parent and exposes stock only as booleans', async () => {
      const child = await getPrisma().category.findUniqueOrThrow({
        where: { slug: 'agarbatti-flora' },
      });
      await createProduct(testApp, { name: 'Flora Special', categoryId: child.id, stock: 3 });
      await createProduct(testApp, { name: 'Out of stock', categoryId: child.id, stock: 0 });

      const parent = envelope<Summary[]>(
        await get('/categories/agarbatti/products?sort=newest'),
      ).data;
      const childOnly = envelope<Summary[]>(await get('/categories/agarbatti-flora/products')).data;

      expect(parent.map((item) => item.slug)).toContain('flora-special');
      expect(childOnly.map((item) => item.slug).sort()).toEqual(['flora-special', 'out-of-stock']);
      const flora = childOnly.find((item) => item.slug === 'flora-special');
      expect(flora).toMatchObject({ inStock: true, lowStock: true });
      expect(childOnly.find((item) => item.slug === 'out-of-stock')).toMatchObject({
        inStock: false,
        lowStock: false,
      });
      expect(JSON.stringify(childOnly)).not.toContain('"stock"');
      expect(flora?.image?.src).toMatch(
        /^http:\/\/localhost:9000\/media\/products\/.*-1024\.webp$/,
      );
      expect(flora?.image?.srcset.avif).toContain('-1600.avif 1600w');
    });
  });

  describe('GET /products/:slug', () => {
    it('renders sanitised HTML, related products (max 8, never itself), breadcrumb, manufacturer and an ETag', async () => {
      const product = await createProduct(testApp, {
        name: 'Detail Product',
        categoryId,
        stock: 10,
        description: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'About' }] },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'shop',
                  marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                },
              ],
            },
          ],
        },
      });
      for (let index = 0; index < 9; index += 1)
        await createProduct(testApp, { name: `Sibling ${index}`, categoryId, stock: 1 });

      const res = await get(`/products/${product.slug}`);
      const body = envelope<{
        descriptionHtml: string;
        related: { slug: string }[];
        breadcrumb: { slug: string }[];
        manufacturer: { name: string; legalName: string };
        variants: { isDefault: boolean }[];
        images: { alt: string }[];
        hsnCode: string;
        gstRate: number;
      }>(res).data;
      const etag = res.headers.etag as string;
      const notModified = await get(`/products/${product.slug}`, { 'if-none-match': etag });
      const modified = await get(`/products/${product.slug}`, { 'if-none-match': '"other"' });

      expect(res.statusCode).toBe(200);
      expect(body.descriptionHtml).toBe(
        '<h2>About</h2><p><a href="https://example.com" rel="noopener nofollow" target="_blank">shop</a></p>',
      );
      expect(body.related).toHaveLength(8);
      expect(body.related.map((item) => item.slug)).not.toContain(product.slug);
      expect(body.breadcrumb).toEqual([{ name: 'Agarbatti', slug: 'agarbatti' }]);
      expect(body.manufacturer.name).toBe('Invita Company');
      expect(body.manufacturer.legalName).toContain('placeholder');
      expect(body.variants[0]).toMatchObject({ isDefault: true, inStock: true });
      expect(body.images[0]?.alt).toBe('Detail Product image');
      expect(body).toMatchObject({ hsnCode: '3307', gstRate: 5 });
      expect(JSON.stringify(body)).not.toMatch(/"stock"/);
      expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
      expect(notModified.statusCode).toBe(304);
      expect(modified.statusCode).toBe(200);
    });

    it('returns 404 for unknown and inactive products and 400 for traversal attempts', async () => {
      const draft = await createProduct(testApp, {
        name: 'Unpublished',
        categoryId,
        active: false,
      });

      expect((await get('/products/nope')).statusCode).toBe(404);
      expect((await get(`/products/${draft.slug}`)).statusCode).toBe(404);
      expect((await get('/products/..%2F..%2Fetc')).statusCode).toBe(400);
      expect([400, 404]).toContain((await get('/products/%2e%2e')).statusCode);
      expect((await get('/categories/..%2Fx/products')).statusCode).toBe(400);
    });

    it('never fails when a stored description predates the schema', async () => {
      const product = await createProduct(testApp, { name: 'Legacy doc', categoryId, stock: 1 });
      await getPrisma().product.update({
        where: { id: product.id },
        data: { description: { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] } },
      });

      const res = await get(`/products/${product.slug}`);

      expect(res.statusCode).toBe(200);
      expect(envelope<{ descriptionHtml: string }>(res).data.descriptionHtml).toBe('');
    });
  });

  describe('GET /settings/public', () => {
    it('returns the public subset and caches it for 60 s', async () => {
      const first = envelope<{
        brand: { name: string };
        announcementBar: { text: string };
        freeShippingThreshold: number;
        pickupLocation: { city: string };
      }>(await get('/settings/public')).data;
      await getPrisma().siteSetting.update({
        where: { key: 'free_shipping_threshold' },
        data: { value: 1 },
      });
      const cached = envelope<{ freeShippingThreshold: number }>(
        await get('/settings/public'),
      ).data;
      await testApp.app.settings.invalidate();
      const fresh = envelope<{ freeShippingThreshold: number }>(await get('/settings/public')).data;

      expect(Object.keys(first).sort()).toEqual([
        'announcementBar',
        'brand',
        'business',
        'freeShippingThreshold',
        'pickupLocation',
        'promoPopup',
        'returnWindowDays',
      ]);
      expect(first.pickupLocation).toEqual({ city: 'Chennai' });
      expect(first.freeShippingThreshold).toBe(59900);
      expect(cached.freeShippingThreshold).toBe(59900);
      expect(fresh.freeShippingThreshold).toBe(1);
      expect((first as unknown as { business: { isPlaceholder: boolean } }).business.isPlaceholder).toBe(true);
      expect(JSON.stringify(first)).not.toContain('gst_profile');
    });
  });

  it('documents that the descriptionHtml sanitiser is applied even to link marks stored with bad rel/target', async () => {
    const product = await createProduct(testApp, { name: 'Rel test', categoryId, stock: 1 });
    await getPrisma().product.update({
      where: { id: product.id },
      data: {
        description: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'https://a.example', rel: 'opener', target: '_blank' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const html = envelope<{ descriptionHtml: string }>(await get(`/products/${product.slug}`)).data
      .descriptionHtml;

    expect(html).toContain('rel="noopener nofollow"');
    void SYSTEM;
    void doc;
  });
});
