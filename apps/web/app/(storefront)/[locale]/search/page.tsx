import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CategoryGrid } from '@/components/catalogue/CategoryGrid';
import { ProductGrid } from '@/components/catalogue/ProductGrid';
import { Container, Section } from '@/components/ui/Primitives';
import { searchProducts, getCategoryTree } from '@/lib/api/storefront';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ q?: string | string[] }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] : q;
  return {
    title: query ? `Search: ${query}` : 'Search',
    robots: { index: false },
  };
}

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? '';
  const t = await getTranslations('catalogue');

  const [results, topCategories] = await Promise.all([
    query ? searchProducts(query) : Promise.resolve({ products: [], categories: [] }),
    getCategoryTree(),
  ]);

  const hasResults = results.products.length > 0 || results.categories.length > 0;

  return (
    <Container>
      <Section>
        <h1 className="font-display text-h1">
          {query
            ? t('searchResultsFor', { query })
            : t('search')}
        </h1>

        {query && !hasResults && (
          <div className="mt-8" data-testid="search-empty">
            <p className="text-muted">{t('noResults', { query })}</p>
            <div className="mt-8">
              <h2 className="mb-4 font-display text-h2">{t('browseCategories')}</h2>
              <CategoryGrid categories={topCategories.slice(0, 8)} />
            </div>
          </div>
        )}

        {results.categories.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-4 font-display text-h2">{t('categories')}</h2>
            <div className="flex flex-wrap gap-2">
              {results.categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`/${locale}/collections/${cat.slug}`}
                  className="rounded-control border border-hairline px-4 py-2 text-base text-text transition-colors duration-fast hover:bg-surface"
                >
                  {cat.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {results.products.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-4 font-display text-h2">{t('products')}</h2>
            <ProductGrid products={results.products} locale={locale} />
          </div>
        )}
      </Section>
    </Container>
  );
}
