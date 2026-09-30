import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory, createProduct, envelope } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

interface SearchBody {
  readonly products: { slug: string; name: string }[];
  readonly categories: { slug: string; name: string }[];
}

describe('GET /search (Postgres SearchPort)', () => {
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

  const search = (query: string, ip = '10.1.1.1') =>
    testApp.app.inject({ method: 'GET', url: `/api/v1/search?${query}`, remoteAddress: ip });

  it('finds products by tag, by typo-tolerant name, by product SKU and by variant SKU', async () => {
    await createProduct(testApp, {
      name: 'Pure Camphor Tablets',
      categoryId,
      sku: 'PE-PS-001',
      tags: ['kapur', 'camphor'],
      stock: 5,
    });
    await createProduct(testApp, { name: 'Kapur', categoryId, sku: 'PE-KAP', stock: 5 });

    const byTag = envelope<SearchBody>(await search('q=kapur')).data;
    const byTypo = envelope<SearchBody>(await search('q=kapor&type=products')).data;
    const bySku = envelope<SearchBody>(await search('q=pe-ps-001')).data;
    const byVariantSku = envelope<SearchBody>(await search('q=PE-KAP-V1')).data;

    expect(byTag.products.map((p) => p.slug)).toContain('pure-camphor-tablets');
    expect(byTypo.products.map((p) => p.slug)).toContain('kapur');
    expect(bySku.products.map((p) => p.slug)).toEqual(['pure-camphor-tablets']);
    expect(byVariantSku.products.map((p) => p.slug)).toEqual(['kapur']);
    expect(byTypo.categories).toEqual([]);
  });

  it('ranks a name match above a tag match, excludes inactive products and honours the limit', async () => {
    await createProduct(testApp, {
      name: 'Scented Sticks',
      categoryId,
      tags: ['sandal'],
      stock: 1,
    });
    await createProduct(testApp, { name: 'Sandal Agarbatti', categoryId, stock: 1 });
    await createProduct(testApp, { name: 'Sandal Dhoop', categoryId, stock: 1, active: false });
    await createProduct(testApp, { name: 'Sandal Cones', categoryId, stock: 1 });

    const all = envelope<SearchBody>(await search('q=sandal')).data;
    const limited = envelope<SearchBody>(await search('q=sandal&limit=1')).data;

    const slugs = all.products.map((p) => p.slug);
    const tagOnlyIndex = slugs.indexOf('scented-sticks');
    expect(all.products[0]?.name).toMatch(/sandal/i);
    expect(tagOnlyIndex).toBeGreaterThan(-1);
    expect(slugs.slice(0, tagOnlyIndex).every((slug) => slug.includes('sandal'))).toBe(true);
    expect(slugs).toContain('sandal-agarbatti');
    expect(slugs).toContain('sandal-cones');
    expect(slugs).not.toContain('sandal-dhoop');
    expect(limited.products).toHaveLength(1);
  });

  it('matches categories by name and treats search operators as literals', async () => {
    await createCategory(testApp, 'Camphor Lamps');

    const categories = envelope<SearchBody>(await search('q=camphor&type=categories')).data;
    const injected = await search(`q=${encodeURIComponent("' OR 1=1 --")}`);
    const operators = await search(`q=${encodeURIComponent('kapur OR -dhoop "quoted')}`);
    const empty = await search('q=');
    const long = await search(`q=${'a'.repeat(101)}`);

    expect(categories.categories.map((c) => c.slug)).toEqual(['camphor-lamps']);
    expect(categories.products).toEqual([]);
    expect(injected.statusCode).toBe(200);
    expect(envelope<SearchBody>(injected).data.products).toEqual([]);
    expect(operators.statusCode).toBe(200);
    expect(empty.statusCode).toBe(400);
    expect(long.statusCode).toBe(400);
  });

  it('rate limits to 60 requests per minute per IP', async () => {
    const strict = await buildTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    try {
      const responses = [];
      for (let index = 0; index < 61; index += 1)
        responses.push(
          await strict.app.inject({
            method: 'GET',
            url: '/api/v1/search?q=kapur',
            remoteAddress: '10.9.9.9',
          }),
        );
      const other = await strict.app.inject({
        method: 'GET',
        url: '/api/v1/search?q=kapur',
        remoteAddress: '10.9.9.8',
      });

      expect(responses.slice(0, 60).every((res) => res.statusCode === 200)).toBe(true);
      expect(responses[60]?.statusCode).toBe(429);
      expect(responses[60]?.headers['retry-after']).toBeDefined();
      expect(other.statusCode).toBe(200);
    } finally {
      await strict.close();
    }
  });
});
