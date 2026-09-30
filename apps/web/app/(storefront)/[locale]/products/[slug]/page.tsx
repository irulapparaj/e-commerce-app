import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { JsonLd } from '@/components/catalogue/JsonLd';
import { ProductGallery } from '@/components/catalogue/ProductGallery';
import { ProductInfo } from '@/components/catalogue/ProductInfo';
import { RelatedProducts } from '@/components/catalogue/RelatedProducts';
import { Specifications } from '@/components/catalogue/Specifications';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Container, Section } from '@/components/ui/Primitives';
import { getProductDetail, getPublicSettings, getFeaturedProducts } from '@/lib/api/storefront';
import { breadcrumbSchema, productSchema } from '@/lib/catalogue/seo';
import { buildProductUrl, buildCategoryUrl } from '@/lib/catalogue/urls';
import { getWebEnv } from '@/lib/env';

// Next segment config must be a literal (REVALIDATE.pdp).
export const revalidate = 900;

interface ProductPageProps {
  readonly params: Promise<{ locale: string; slug: string }>;
}

const getOrigin = (): string => getWebEnv().WEB_ORIGIN;

export async function generateStaticParams() {
  try {
    const products = await getFeaturedProducts(20);
    return products.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductDetail(slug);
  if (!product) return {};
  const origin = getOrigin();
  return {
    title: product.seo.metaTitle ?? product.name,
    description:
      product.seo.metaDescription ??
      product.descriptionHtml.replace(/<[^>]+>/g, '').slice(0, 160),
    alternates: { canonical: `${origin}${buildProductUrl(locale, slug)}` },
    openGraph: {
      type: 'website',
      images: product.images[0]
        ? [{ url: product.images[0].src, alt: product.images[0].alt }]
        : [],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [product, settings] = await Promise.all([getProductDetail(slug), getPublicSettings()]);
  if (!product) notFound();

  const origin = getOrigin();
  const t = await getTranslations('catalogue');

  const breadcrumbItems: readonly { label: string; href?: string }[] = [
    { label: t('home'), href: `/${locale}` },
    ...product.breadcrumb.map((crumb, index) =>
      index < product.breadcrumb.length - 1
        ? { label: crumb.name, href: buildCategoryUrl(locale, crumb.slug) }
        : { label: crumb.name },
    ),
    { label: product.name },
  ];

  const breadcrumbLd = breadcrumbSchema(origin, locale, product.breadcrumb);
  const productLd = productSchema(product, origin, locale);

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={productLd} />
      <Container>
        <Section>
          <Breadcrumb items={breadcrumbItems} />

          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <ProductGallery images={product.images} name={product.name} />
            <ProductInfo product={product} settings={settings} />
          </div>

          {product.descriptionHtml && (
            <div className="mt-12 border-t border-hairline pt-8">
              <h2 className="mb-4 font-display text-h2">{t('description')}</h2>
              <div
                className="prose max-w-none"
                // eslint-disable-next-line react/no-danger -- HTML is admin-authored and sanitized server-side before storage
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
              />
            </div>
          )}

          {product.howToUse && (
            <div className="mt-8 border-t border-hairline pt-8">
              <h2 className="mb-4 font-display text-h2">{t('howToUse')}</h2>
              <p className="text-base text-muted whitespace-pre-line">{product.howToUse}</p>
            </div>
          )}

          {Object.keys(product.specifications).length > 0 && (
            <div className="mt-8 border-t border-hairline pt-8">
              <Specifications specs={product.specifications} />
            </div>
          )}

          <div className="mt-8 border-t border-hairline pt-8">
            <p className="text-small text-muted">
              {t('manufacturer')}: {product.manufacturer.legalName} ·{' '}
              {product.manufacturer.addressLines.join(', ')}
            </p>
          </div>

          {product.related.length > 0 && (
            <div className="mt-12 border-t border-hairline pt-8">
              <h2 className="mb-6 font-display text-h2">{t('relatedProducts')}</h2>
              <RelatedProducts products={product.related} locale={locale} />
            </div>
          )}
        </Section>
      </Container>
    </>
  );
}
