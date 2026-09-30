import type { PublicSettings } from '@pe/shared';

export interface BreadcrumbItem {
  readonly name: string;
  readonly url: string;
}

export const buildBreadcrumbJsonLd = (items: readonly BreadcrumbItem[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

export const buildOrganizationJsonLd = (settings: PublicSettings, siteUrl: string) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: settings.brand.name,
  url: siteUrl,
  description: settings.brand.tagline,
  ...(settings.business.isPlaceholder
    ? {}
    : {
        legalName: settings.business.legalName,
        address: {
          '@type': 'PostalAddress',
          addressLocality: settings.pickupLocation.city,
          addressRegion: 'Tamil Nadu',
          addressCountry: 'IN',
        },
      }),
});
