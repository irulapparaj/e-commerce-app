import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const CACHE_TTL_SECONDS = 600;
const STATIC_PAGE_SLUGS = [
  'about-us',
  'contact',
  'faq',
  'grievance-redressal',
  'become-a-seller',
];
const POLICY_SLUGS = ['shipping', 'refund', 'privacy', 'terms', 'pricing'];

export interface SitemapProduct {
  readonly slug: string;
  readonly updatedAt: string;
}

export interface SitemapData {
  readonly products: readonly SitemapProduct[];
  readonly categorySlugs: readonly string[];
  readonly pages: readonly string[];
  readonly policies: readonly string[];
}

/** P16: Provides data for the Next.js sitemap builder. Cached in Valkey for 10 minutes. */
export const sitemapRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get('/sitemap-data', async () => {
    const cacheKey = 'sitemap:data';
    const cached = await app.valkey.get(cacheKey);
    if (cached !== null) return ok(JSON.parse(cached) as SitemapData);

    const [products, categories] = await Promise.all([
      app.prisma.product.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10_000,
      }),
      app.prisma.category.findMany({
        select: { slug: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const data: SitemapData = {
      products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })),
      categorySlugs: categories.map((c) => c.slug),
      pages: STATIC_PAGE_SLUGS,
      policies: POLICY_SLUGS,
    };

    await app.valkey.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);

    return ok(data);
  });
};
