'use client';

import { useTranslations } from 'next-intl';
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Link, useRouter  } from '@/i18n/navigation';
import type { CategoryNode, SearchResultDto } from '@/lib/api/types';
import { buildSearchUrl } from '@/lib/catalogue/urls';

import { SearchBrowse } from './SearchBrowse';

interface SearchOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly locale: string;
  /** Top-level categories for the empty state, so the overlay is never a blank screen. */
  readonly categories?: readonly CategoryNode[];
}

const DEBOUNCE_MS = 250;

export function SearchOverlay({ open, onClose, locale, categories = [] }: SearchOverlayProps) {
  const t = useTranslations('catalogue');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { modalRef } = useFocusTrap({ isOpen: open, onClose });

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActiveIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = (await res.json()) as { data: SearchResultDto };
            setResults(data.data);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const allItems = [
    ...(results?.products.map((p) => ({ type: 'product' as const, slug: p.slug, name: p.name })) ?? []),
    ...(results?.categories.map((c) => ({ type: 'category' as const, slug: c.slug, name: c.name })) ?? []),
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && allItems[activeIndex]) {
        const item = allItems[activeIndex];
        const href = item.type === 'product'
          ? `/${locale}/products/${item.slug}`
          : `/${locale}/collections/${item.slug}`;
        router.push(href);
        onClose();
      } else if (query.trim()) {
        router.push(buildSearchUrl(locale, query));
        onClose();
      }
    }
  };

  const totalCount = (results?.products.length ?? 0) + (results?.categories.length ?? 0);
  const idle = query.trim().length < 2;

  if (!open) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('search')}
      className="fixed inset-0 z-overlay flex flex-col bg-bg motion-safe:animate-fade-in"
    >
      <div role="search" aria-label={t('search')} className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-hairline px-gutter min-h-header">
        <Icon name="search" size={20} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="flex-1 bg-transparent text-base text-text placeholder:text-muted outline-none min-h-touch"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          aria-label={t('closeSearch')}
          onClick={onClose}
          className="inline-flex size-touch items-center justify-center text-muted hover:text-text"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {!loading && results !== null && t('searchResults', { count: totalCount })}
      </div>

      <div className="flex-1 overflow-y-auto px-gutter py-4">
        {idle && (
          <SearchBrowse categories={categories} locale={locale} onNavigate={onClose} />
        )}

        {loading && (
          <p className="text-small text-muted">{t('search')}&hellip;</p>
        )}

        {!loading && results !== null && results.products.length === 0 && results.categories.length === 0 && (
          <p className="text-small text-muted">{t('noResults', { query })}</p>
        )}

        {!loading && results !== null && results.products.length > 0 && (
          <section className="mb-4">
            <h2 className="text-caption text-muted uppercase tracking-caps mb-2">{t('products')}</h2>
            <ul>
              {results.products.map((product, idx) => (
                <li key={product.id}>
                  <Link
                    href={`/${locale}/products/${product.slug}`}
                    onClick={onClose}
                    className={cx(
                      'block py-2 px-3 rounded-control text-base text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      activeIndex === idx && 'bg-surface',
                    )}
                  >
                    {product.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && results !== null && results.categories.length > 0 && (
          <section>
            <h2 className="text-caption text-muted uppercase tracking-caps mb-2">{t('categories')}</h2>
            <ul>
              {results.categories.map((category, idx) => {
                const itemIndex = (results.products.length) + idx;
                return (
                  <li key={category.id}>
                    <Link
                      href={`/${locale}/collections/${category.slug}`}
                      onClick={onClose}
                      className={cx(
                        'block py-2 px-3 rounded-control text-base text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        activeIndex === itemIndex && 'bg-surface',
                      )}
                    >
                      {category.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      </div>
    </div>
  );
}
