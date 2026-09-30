import type { MetadataRoute } from 'next';

import { getWebEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const { WEB_ORIGIN } = getWebEnv();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/account', '/checkout', '/cart', '/search', '/api'],
      },
    ],
    sitemap: `${WEB_ORIGIN}/sitemap.xml`,
  };
}
