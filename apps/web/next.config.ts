import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;
const [mediaHostname, mediaPort] = (mediaHost ?? '').split(':');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@pe/shared'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: mediaHostname
      ? [
          { protocol: 'http', hostname: mediaHostname, ...(mediaPort ? { port: mediaPort } : {}) },
          { protocol: 'https', hostname: mediaHostname, ...(mediaPort ? { port: mediaPort } : {}) },
        ]
      : [],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
