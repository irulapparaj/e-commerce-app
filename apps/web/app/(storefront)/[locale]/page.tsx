import { brand } from '@pe/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BrandStory } from '@/components/catalogue/BrandStory';
import { CategoryGrid } from '@/components/catalogue/CategoryGrid';
import { Hero } from '@/components/catalogue/Hero';
import { ProductGrid } from '@/components/catalogue/ProductGrid';
import { TrustStrip } from '@/components/catalogue/TrustStrip';
import { HomeFaq } from '@/components/content/HomeFaq';
import { ReassuranceBand } from '@/components/content/ReassuranceBand';
import { Testimonials } from '@/components/content/Testimonials';
import { Link } from '@/components/ui/Link';
import { Container, Section } from '@/components/ui/Primitives';
import { getCategoryTree, getFeaturedProducts, getPublicSettings } from '@/lib/api/storefront';
import { HOME_FEATURED_LIMIT } from '@/lib/catalogue/constants';
import { featuredFirst } from '@/lib/catalogue/featured';

// Next segment config must be a literal (REVALIDATE.home).
export const revalidate = 3600;

/** The API's smallest page; the home grid shows `HOME_FEATURED_LIMIT` of them, featured first. */
const FEATURED_FETCH_LIMIT = 12;

interface HomePageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const [settings, t] = await Promise.all([
    getPublicSettings(),
    getTranslations({ locale, namespace: 'home' }),
  ]);
  const name = settings.brand.name || brand.name;
  const tagline = settings.brand.tagline || brand.tagline;
  return {
    title: { absolute: `${name} · ${tagline}` },
    description: t('hero.lede', { city: settings.pickupLocation.city }),
  };
}

/**
 * Home: hero (value proposition), the four trust facts, every top-level category, eight best
 * sellers, the purity band, three customer quotes, the brand promise and five FAQ entries.
 * The newsletter lives in the footer only, so it appears once.
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [settings, categories, products] = await Promise.all([
    getPublicSettings(),
    getCategoryTree(),
    getFeaturedProducts(FEATURED_FETCH_LIMIT),
  ]);
  const featured = featuredFirst(products, HOME_FEATURED_LIMIT);

  const t = await getTranslations('home');

  return (
    <>
      <Hero settings={settings} />
      <TrustStrip settings={settings} />

      {categories.length > 0 && (
        <Container>
          <CategoryGrid categories={categories} />
        </Container>
      )}

      {featured.length > 0 && (
        <Container>
          <Section space="tight" aria-labelledby="bestsellers-heading">
            <div className="mb-6 flex items-baseline justify-between gap-4 md:mb-8">
              <h2 id="bestsellers-heading" className="font-display text-h2">
                {t('bestSellers')}
              </h2>
              <Link href="/collections" variant="quiet">
                {t('shopAll')}
              </Link>
            </div>
            <ProductGrid products={featured} locale={locale} />
          </Section>
        </Container>
      )}

      <ReassuranceBand />
      <Testimonials />
      <BrandStory settings={settings} />
      <HomeFaq />
    </>
  );
}
