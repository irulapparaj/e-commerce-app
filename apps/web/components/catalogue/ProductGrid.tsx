import { getTranslations } from 'next-intl/server';

import type { ProductSummaryDto } from '@/lib/api/types';

import { ProductCard } from './ProductCard';

interface ProductGridProps {
  readonly products: readonly ProductSummaryDto[];
  readonly locale: string;
  readonly view?: 'grid' | 'list';
}

export async function ProductGrid({ products, locale, view = 'grid' }: ProductGridProps) {
  const t = await getTranslations('catalogue');

  if (products.length === 0) {
    return <p className="py-16 text-center text-base text-muted">{t('emptyCollection')}</p>;
  }

  return (
    <ul
      className={
        view === 'grid'
          ? 'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4'
          : 'flex flex-col gap-4'
      }
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} locale={locale} view={view} />
      ))}
    </ul>
  );
}
