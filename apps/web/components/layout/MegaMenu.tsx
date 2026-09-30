'use client';

import { useTranslations } from 'next-intl';
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { cx } from '@/components/ui/cx';
import { Link as IntlLink } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';

import {
  focusFirstLink,
  movePanelFocus,
  nextTriggerIndex,
  staysInside,
  triggerElements,
  useHoverIntent,
} from './megaMenuKeys';
import { collectionHref, MegaMenuPanel } from './MegaMenuPanel';

export { HOVER_INTENT_MS } from './megaMenuKeys';

const TRIGGER =
  'inline-flex min-h-touch items-center gap-1 whitespace-nowrap border-b-2 px-1 small-caps text-small text-muted no-underline transition-colors duration-fast ease-out hover:text-text';

interface MegaMenuProps {
  readonly categories: readonly CategoryNode[];
}

/**
 * Desktop navigation from `xl` (seven items plus the actions need the width; below that the drawer takes over). Top-level buttons disclose a two-column panel with one image.
 * Keyboard: ←/→ move between items, ↓/Enter/Space open and focus the first link, ↑/↓ move inside,
 * Escape closes and returns focus, leaving the nav closes. Pointer: 120 ms hover intent.
 */
export function MegaMenu({ categories }: MegaMenuProps) {
  const t = useTranslations('nav');
  const baseId = useId();
  const navRef = useRef<HTMLElement>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [focusPanel, setFocusPanel] = useState(false);
  const hover = useHoverIntent(setOpenSlug);

  const triggerId = (slug: string) => `${baseId}-trigger-${slug}`;
  const panelId = (slug: string) => `${baseId}-panel-${slug}`;

  useEffect(() => {
    if (!focusPanel || openSlug === null) return;
    focusFirstLink(document.getElementById(`${baseId}-panel-${openSlug}`));
    setFocusPanel(false);
  }, [focusPanel, openSlug, baseId]);

  const open = (slug: string, moveFocus: boolean) => {
    hover.cancel();
    setOpenSlug(slug);
    setFocusPanel(moveFocus);
  };

  const close = (returnTo: string | null) => {
    hover.cancel();
    setOpenSlug(null);
    if (returnTo !== null) document.getElementById(triggerId(returnTo))?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLElement>, category: CategoryNode) => {
    const items = triggerElements(navRef.current);
    const index = items.findIndex((item) => item === event.currentTarget);
    const move = nextTriggerIndex(event.key, index, items.length);
    if (move !== null) {
      event.preventDefault();
      const target = items[move];
      target?.focus();
      if (openSlug !== null) setOpenSlug(target?.dataset['menuTrigger'] ?? null);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(category.slug);
    } else if (event.key === 'ArrowDown' && category.children.length > 0) {
      event.preventDefault();
      open(category.slug, true);
    }
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>, category: CategoryNode) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(category.slug);
    } else if (movePanelFocus(event.currentTarget, event.key)) {
      event.preventDefault();
    }
  };

  const onPointer = (event: PointerEvent<HTMLElement>, slug: string | null) => {
    if (event.pointerType !== 'touch') hover.schedule(slug);
  };

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!staysInside(navRef.current, event.relatedTarget)) close(null);
  };

  if (categories.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label={t('main')}
      className="hidden xl:block"
      onPointerLeave={(event) => onPointer(event, null)}
      onBlur={onBlur}
      data-testid="mega-menu"
    >
      <ul className="flex items-center gap-5 xl:gap-6">
        {categories.map((category) => {
          const isOpen = openSlug === category.slug;
          const hasChildren = category.children.length > 0;
          return (
            <li
              key={category.id}
              onPointerEnter={(event) => hasChildren && onPointer(event, category.slug)}
            >
              {hasChildren ? (
                <button
                  type="button"
                  id={triggerId(category.slug)}
                  aria-expanded={isOpen}
                  aria-controls={panelId(category.slug)}
                  data-menu-trigger={category.slug}
                  onClick={(event) =>
                    isOpen ? close(null) : open(category.slug, event.detail === 0)
                  }
                  onKeyDown={(event) => onTriggerKeyDown(event, category)}
                  className={cx(
                    TRIGGER,
                    isOpen ? 'border-accent' : 'border-transparent hover:border-hairline',
                  )}
                  data-testid={`mega-menu-trigger-${category.slug}`}
                >
                  {category.name}
                </button>
              ) : (
                <IntlLink
                  href={collectionHref(category.slug)}
                  id={triggerId(category.slug)}
                  data-menu-trigger={category.slug}
                  onKeyDown={(event) => onTriggerKeyDown(event, category)}
                  className={cx(TRIGGER, 'border-transparent hover:border-hairline')}
                >
                  {category.name}
                </IntlLink>
              )}
              {hasChildren && isOpen && (
                <MegaMenuPanel
                  category={category}
                  id={panelId(category.slug)}
                  labelledBy={triggerId(category.slug)}
                  onKeyDown={(event) => onPanelKeyDown(event, category)}
                  onNavigate={() => close(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
