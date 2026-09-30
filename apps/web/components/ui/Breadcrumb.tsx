import { useTranslations } from 'next-intl';

import { Link } from './Link';

export interface BreadcrumbItem {
  readonly label: string;
  /** Omitted on the current page. */
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

/** `Home / Agarbatti / Premium` — the last item is the current page. */
export function Breadcrumb({ items }: BreadcrumbProps) {
  const t = useTranslations('a11y');
  return (
    <nav aria-label={t('breadcrumb')}>
      <ol className="flex flex-wrap items-center gap-2 text-small text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-subtle">
                  /
                </span>
              )}
              {last || item.href === undefined ? (
                <span aria-current={last ? 'page' : undefined} className="text-text">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} variant="quiet">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
