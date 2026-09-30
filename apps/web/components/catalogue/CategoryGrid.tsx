import { useTranslations } from 'next-intl';

import { Section } from '@/components/ui/Primitives';
import type { CategoryNode } from '@/lib/api/types';

import { CategoryTile } from './CategoryTile';

export const CATEGORIES_SECTION_ID = 'shop-by-category';

interface CategoryGridProps {
  readonly categories: readonly CategoryNode[];
}

/**
 * Top-level categories. Under `lg` the row bleeds to the viewport edge and scroll-snaps with a
 * peeking tile as the cue; from `lg` every category sits in one auto-fit grid row so nothing hides
 * behind a scroll on desktop. The hero's "Explore categories" link lands on the heading row.
 */
export function CategoryGrid({ categories }: CategoryGridProps) {
  const t = useTranslations('home');

  if (categories.length === 0) return null;

  return (
    <Section space="tight" aria-labelledby="categories-heading">
      <div
        id={CATEGORIES_SECTION_ID}
        className="mb-6 scroll-mt-[calc(var(--header-height)+1rem)] flex items-baseline justify-between gap-4"
      >
        <h2 id="categories-heading" className="font-display text-h2">
          {t('shopByCategory')}
        </h2>
      </div>

      <ul
        className="-mx-gutter flex snap-x snap-mandatory gap-3 overflow-x-auto px-gutter pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0"
        data-testid="category-grid"
      >
        {categories.map((category) => (
          <li
            key={category.id}
            className="w-[44vw] max-w-[220px] shrink-0 snap-start sm:w-[30vw] lg:w-auto lg:max-w-none"
          >
            <CategoryTile category={category} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
