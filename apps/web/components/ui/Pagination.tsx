import { useTranslations } from 'next-intl';

import { Link as IntlLink } from '@/i18n/navigation';

import { cx } from './cx';
import { Icon } from './Icon';

export type PageToken = number | 'gap';

const SIBLINGS = 1;
const EDGE = 1;
/** Up to this many pages everything is listed; an ellipsis would hide a single number. */
const FULL_WINDOW = 2 * EDGE + 2 * SIBLINGS + 3;

const range = (from: number, to: number): readonly number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);

/** `1 … 4 5 6 … 12` — the current page with one sibling each side, and both edges. */
export const pageWindow = (page: number, total: number): readonly PageToken[] => {
  if (total <= 0) return [];
  if (total <= FULL_WINDOW) return range(1, total);
  const wanted = [
    ...range(1, EDGE),
    ...range(page - SIBLINGS, page + SIBLINGS),
    ...range(total - EDGE + 1, total),
  ];
  const pages = [...new Set(wanted)].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  return pages.flatMap<PageToken>((n, index) => {
    const previous = pages[index - 1];
    if (previous === undefined || n - previous === 1) return [n];
    return n - previous === 2 ? [previous + 1, n] : ['gap', n];
  });
};

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  /** URL is the state: the page number becomes a link the browser can share. */
  readonly hrefFor: (page: number) => string;
}

const ITEM =
  'inline-flex min-h-touch min-w-touch items-center justify-center rounded-control px-2 text-base tabular-nums transition-colors duration-fast ease-out';

export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  const t = useTranslations('a11y');
  if (totalPages <= 1) return null;
  const tokens = pageWindow(page, totalPages);
  return (
    <nav aria-label={t('pagination')}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {page > 1 ? (
            <IntlLink
              href={hrefFor(page - 1)}
              aria-label={t('previousPage')}
              className={cx(ITEM, 'hover:bg-surface')}
            >
              <Icon name="chevron" direction="left" size={16} />
            </IntlLink>
          ) : (
            <span aria-hidden="true" className={cx(ITEM, 'opacity-40')}>
              <Icon name="chevron" direction="left" size={16} />
            </span>
          )}
        </li>
        {tokens.map((token, index) =>
          token === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className={cx(ITEM, 'text-subtle')}>
              …
            </li>
          ) : (
            <li key={token}>
              <IntlLink
                href={hrefFor(token)}
                aria-label={t('page', { page: token })}
                aria-current={token === page ? 'page' : undefined}
                className={cx(
                  ITEM,
                  token === page
                    ? 'border-b-2 border-accent font-medium text-text'
                    : 'text-muted hover:bg-surface hover:text-text',
                )}
              >
                {token}
              </IntlLink>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <IntlLink
              href={hrefFor(page + 1)}
              aria-label={t('nextPage')}
              className={cx(ITEM, 'hover:bg-surface')}
            >
              <Icon name="chevron" direction="right" size={16} />
            </IntlLink>
          ) : (
            <span aria-hidden="true" className={cx(ITEM, 'opacity-40')}>
              <Icon name="chevron" direction="right" size={16} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
