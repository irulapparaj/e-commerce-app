'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';

interface SearchBrowseProps {
  readonly categories: readonly CategoryNode[];
  readonly locale: string;
  readonly onNavigate: () => void;
}

const CHIP =
  'inline-flex min-h-9 items-center rounded-control border border-hairline bg-surface px-3 text-small text-text no-underline transition-colors duration-fast ease-out hover:border-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The search overlay before a query: a hint and the top-level categories, never a blank screen. */
export function SearchBrowse({ categories, locale, onNavigate }: SearchBrowseProps) {
  const t = useTranslations('catalogue');

  return (
    <section
      aria-labelledby="search-browse-heading"
      className="mx-auto w-full max-w-content"
      data-testid="search-browse"
    >
      <p className="text-small text-muted">{t('searchHint')}</p>
      {categories.length > 0 && (
        <>
          <h2
            id="search-browse-heading"
            className="mb-3 mt-6 text-caption uppercase tracking-caps text-muted"
          >
            {t('searchBrowse')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/${locale}/collections/${category.slug}`}
                  onClick={onNavigate}
                  className={CHIP}
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
