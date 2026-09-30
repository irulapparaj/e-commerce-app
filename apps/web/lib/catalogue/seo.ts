import type { PublicSettings } from '@pe/shared';

import type { BreadcrumbDto, ProductDetailDto } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';

import { localePath } from './urls';

/** Builds an Organization JSON-LD object from public settings. */
export const organizationSchema = (settings: PublicSettings, origin: string) => ({
  '@type': 'Organization',
  name: settings.brand.name,
  url: origin,
  logo: undefined,
});

/** Builds a WebSite JSON-LD with a SearchAction. */
export const webSiteSchema = (origin: string, name: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name,
  url: origin,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${origin}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
});

/** Builds a BreadcrumbList JSON-LD. */
export const breadcrumbSchema = (
  origin: string,
  locale: string,
  items: readonly BreadcrumbDto[],
) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: `${origin}${localePath(locale, `/collections/${item.slug}`)}`,
  })),
});

/** Builds a Product JSON-LD. Price is the GST-inclusive default variant price in rupees. */
export const productSchema = (
  product: ProductDetailDto,
  origin: string,
  locale: string,
) => {
  const defaultVariant =
    product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const pricePaise = defaultVariant?.price ?? product.priceFrom;
  const priceRupees = (pricePaise / 100).toFixed(2);
  const availability = product.inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.slug,
    description:
      product.seo.metaDescription ??
      product.descriptionHtml.replace(/<[^>]+>/g, '').slice(0, 160),
    image: product.images[0]?.src ?? undefined,
    brand: {
      '@type': 'Brand',
      name: product.manufacturer.name,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: priceRupees,
      availability,
      url: `${origin}${localePath(locale, `/products/${product.slug}`)}`,
      priceValidUntil: new Date(Date.now() + 86400 * 30 * 1000).toISOString().split('T')[0],
    },
  };
};

/** Formats paise as a localized rupee string (for display only, not JSON-LD price). */
export { formatPrice };
