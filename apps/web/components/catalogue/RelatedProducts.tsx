import { getTranslations } from 'next-intl/server';

import type { ProductSummaryDto } from '@/lib/api/types';

import { ProductCard } from './ProductCard';

interface RelatedProductsProps {
  readonly products: readonly ProductSummaryDto[];
  readonly locale: string;
}

export async function RelatedProducts({ products, locale }: RelatedProductsProps) {
  if (products.length === 0) return null;

  const t = await getTranslations('catalogue');

  return (
    <section aria-labelledby="related-heading" className="flex flex-col gap-4">
      <h2 id="related-heading" className="text-h2 font-display text-text">
        {t('relatedProducts')}
      </h2>
      <ul className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-gutter px-gutter scrollbar-none">
        {products.map((product) => (
          <li key={product.id} className="snap-start shrink-0 w-[260px]">
            <ProductCard product={product} locale={locale} view="grid" />
          </li>
        ))}
      </ul>
    </section>
  );
}
