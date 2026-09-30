'use client';

import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';

import { Container } from '@/components/ui/Primitives';
import { Link as IntlLink } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';

export const collectionHref = (slug: string): string => `/collections/${slug}`;

/** The panel image: the category's own, else the first child with one. */
export const panelImage = (category: CategoryNode): string | null =>
  category.imageUrl ?? category.children.find((child) => child.imageUrl !== null)?.imageUrl ?? null;

/** Two type columns, filled top-to-bottom, left-to-right. */
export const splitColumns = <T,>(items: readonly T[]): readonly [readonly T[], readonly T[]] => {
  const middle = Math.ceil(items.length / 2);
  return [items.slice(0, middle), items.slice(middle)];
};

const PANEL_IMAGE_WIDTH = 224;
const PANEL_IMAGE_HEIGHT = 280;

const PANEL_LINK =
  'inline-flex min-h-8 items-center text-small font-medium text-text no-underline transition-colors duration-fast ease-out hover:text-accent';

interface MegaMenuPanelProps {
  readonly category: CategoryNode;
  readonly id: string;
  readonly labelledBy: string;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onNavigate: () => void;
}

export function MegaMenuPanel({
  category,
  id,
  labelledBy,
  onKeyDown,
  onNavigate,
}: MegaMenuPanelProps) {
  const t = useTranslations('nav');
  const [left, right] = splitColumns(category.children);
  const image = panelImage(category);

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="absolute inset-x-0 top-full border-b border-hairline bg-bg text-text motion-safe:animate-rise-in"
      data-testid={`mega-menu-panel-${category.slug}`}
    >
      <Container>
        <div className="grid grid-cols-layout gap-6 py-6">
          {[left, right].map((column, index) => (
            <ul key={index} className="col-span-3 flex flex-col">
              {column.map((child) => (
                <li key={child.id}>
                  <IntlLink
                    href={collectionHref(child.slug)}
                    className={PANEL_LINK}
                    onClick={onNavigate}
                  >
                    {child.name}
                  </IntlLink>
                </li>
              ))}
            </ul>
          ))}
          <div className="col-span-2 col-start-8 flex flex-col justify-end">
            <IntlLink
              href={collectionHref(category.slug)}
              className="inline-flex min-h-8 items-center gap-1.5 text-small font-semibold text-text underline decoration-hairline underline-offset-4 transition-colors duration-fast ease-out hover:text-accent hover:decoration-accent"
              onClick={onNavigate}
              data-testid={`explore-all-${category.slug}`}
            >
              {t('exploreAll', { category: category.name })}
            </IntlLink>
          </div>
          <div className="col-span-3 col-start-10">
            {image === null ? (
              <div
                aria-hidden="true"
                className="aspect-product w-full max-w-56 rounded-image border border-hairline bg-surface"
                data-testid="mega-menu-image-placeholder"
              />
            ) : (
              <img
                src={image}
                alt={t('categoryImage', { category: category.name })}
                width={PANEL_IMAGE_WIDTH}
                height={PANEL_IMAGE_HEIGHT}
                loading="lazy"
                decoding="async"
                className="aspect-product w-full max-w-56 rounded-image bg-surface object-cover"
              />
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
