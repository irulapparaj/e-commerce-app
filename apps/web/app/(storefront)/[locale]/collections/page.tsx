import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CollectionToolbar } from '@/components/catalogue/CollectionToolbar';
import { ProductGrid } from '@/components/catalogue/ProductGrid';
import { Pagination } from '@/components/ui/Pagination';
import { Container, Section } from '@/components/ui/Primitives';
import { getAllProducts, getCategoryTree } from '@/lib/api/storefront';
import { COLLECTION_PAGE_SIZE } from '@/lib/catalogue/constants';
import { parseCollectionParams } from '@/lib/catalogue/params';
import { boundsToRupees } from '@/lib/catalogue/price-range';
import { buildAllProductsUrl } from '@/lib/catalogue/urls';

// Next segment config must be a literal (REVALIDATE.collection).
export const revalidate = 900;

interface CollectionsPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: CollectionsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalogue' });
  return {
    title: t('allProducts'),
    description: t('allProductsMeta'),
  };
}

export default async function CollectionsPage({ params, searchParams }: CollectionsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rawParams = await searchParams;
  const collectionParams = parseCollectionParams(rawParams);

  const [result, categories] = await Promise.all([
    getAllProducts(collectionParams),
    getCategoryTree(),
  ]);

  const { products, meta } = result;
  const totalPages = Math.ceil(meta.total / COLLECTION_PAGE_SIZE);
  const t = await getTranslations('catalogue');

  return (
    <Container>
      <Section>
        <h1 className="font-display text-h1">{t('allProducts')}</h1>

        {categories.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <a
                key={cat.id}
                href={`/${locale}/collections/${cat.slug}`}
                className="rounded-control border border-hairline px-3 py-1.5 text-small text-text transition-colors duration-fast hover:bg-surface"
                data-testid="filter-category"
              >
                {cat.name}
              </a>
            ))}
          </div>
        )}

        <CollectionToolbar
          total={meta.total}
          locale={locale}
          slug={null}
          currentParams={collectionParams}
          priceBounds={boundsToRupees(meta.priceRange)}
        />

        {products.length === 0 ? (
          <div className="py-16 text-center text-muted" data-testid="search-empty">
            {t('emptyCollection')}
          </div>
        ) : (
          <ProductGrid products={products} locale={locale} view={collectionParams.view} />
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <Pagination
              page={collectionParams.page}
              totalPages={totalPages}
              hrefFor={(page) => buildAllProductsUrl(locale, { ...collectionParams, page })}
            />
          </div>
        )}
      </Section>
    </Container>
  );
}
