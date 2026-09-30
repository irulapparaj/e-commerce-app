import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CollectionToolbar } from '@/components/catalogue/CollectionToolbar';
import { ProductGrid } from '@/components/catalogue/ProductGrid';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Pagination } from '@/components/ui/Pagination';
import { Container, Section } from '@/components/ui/Primitives';
import { ApiError } from '@/lib/api/envelope';
import { getCategoryTree, getCollectionProducts } from '@/lib/api/storefront';
import { COLLECTION_PAGE_SIZE } from '@/lib/catalogue/constants';
import { parseCollectionParams } from '@/lib/catalogue/params';
import { boundsToRupees } from '@/lib/catalogue/price-range';
import { buildCategoryUrl, buildCollectionUrl } from '@/lib/catalogue/urls';

// Next segment config must be a literal (REVALIDATE.collection).
export const revalidate = 900;

interface CollectionPageProps {
  readonly params: Promise<{ locale: string; slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateStaticParams() {
  try {
    const categories = await getCategoryTree();
    return categories.flatMap((cat) => [
      { slug: cat.slug },
      ...cat.children.map((child) => ({ slug: child.slug })),
    ]);
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'catalogue' });
  const title = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return {
    title,
    description: t('collectionMeta', { name: title }),
    alternates: { canonical: buildCategoryUrl(locale, slug) },
  };
}

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const rawParams = await searchParams;
  const collectionParams = parseCollectionParams(rawParams);

  let result;
  try {
    result = await getCollectionProducts(slug, collectionParams);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { products, meta } = result;
  const totalPages = Math.ceil(meta.total / COLLECTION_PAGE_SIZE);
  const t = await getTranslations('catalogue');
  const categories = await getCategoryTree();
  const category = categories.find((c) => c.slug === slug) ??
    categories.flatMap((c) => c.children).find((c) => c.slug === slug);

  const categoryName = category?.name ?? slug.replace(/-/g, ' ');
  const childCategories = category?.children ?? [];

  const breadcrumbItems: readonly { label: string; href?: string }[] = [
    { label: t('home'), href: `/${locale}` },
    { label: categoryName },
  ];

  return (
    <Container>
      <Section>
        <Breadcrumb items={breadcrumbItems} />
        <h1 className="mt-4 font-display text-h1">{categoryName}</h1>

        {childCategories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {childCategories.map((child) => (
              <a
                key={child.id}
                href={buildCategoryUrl(locale, child.slug)}
                className="rounded-control border border-hairline px-3 py-1 text-small text-text transition-colors duration-fast hover:bg-surface"
              >
                {child.name}
              </a>
            ))}
          </div>
        )}

        <CollectionToolbar
          total={meta.total}
          locale={locale}
          slug={slug}
          currentParams={collectionParams}
          priceBounds={boundsToRupees(meta.priceRange)}
        />

        {products.length === 0 ? (
          <div className="py-16 text-center text-muted">{t('emptyCollection')}</div>
        ) : (
          <ProductGrid products={products} locale={locale} view={collectionParams.view} />
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <Pagination
              page={collectionParams.page}
              totalPages={totalPages}
              hrefFor={(page) => buildCollectionUrl(locale, slug, { ...collectionParams, page })}
            />
          </div>
        )}
      </Section>
    </Container>
  );
}
