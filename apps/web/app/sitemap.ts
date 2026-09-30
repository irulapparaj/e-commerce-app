import type { MetadataRoute } from 'next';

import { apiGet } from '@/lib/api/server';
import { getWebEnv } from '@/lib/env';

import type { SitemapData } from './sitemap.types';

export const revalidate = 600;

const url = (origin: string, path: string): string => `${origin}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { WEB_ORIGIN } = getWebEnv();
  const data = await apiGet<SitemapData>('/sitemap-data').then((r) => r.data).catch(() => null);

  const now = new Date().toISOString();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url(WEB_ORIGIN, '/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: url(WEB_ORIGIN, '/search'), lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
  ];

  const pageRoutes: MetadataRoute.Sitemap = (data?.pages ?? []).map((slug) => ({
    url: url(WEB_ORIGIN, `/pages/${slug}`),
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const policyRoutes: MetadataRoute.Sitemap = (data?.policies ?? []).map((slug) => ({
    url: url(WEB_ORIGIN, `/policies/${slug}`),
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.4,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = (data?.categorySlugs ?? []).map((slug) => ({
    url: url(WEB_ORIGIN, `/collections/${slug}`),
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const productRoutes: MetadataRoute.Sitemap = (data?.products ?? []).map((p) => ({
    url: url(WEB_ORIGIN, `/products/${p.slug}`),
    lastModified: p.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...pageRoutes, ...policyRoutes, ...categoryRoutes, ...productRoutes];
}
