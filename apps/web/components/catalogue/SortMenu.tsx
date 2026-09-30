'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { DEFAULT_SORT, SORT_OPTIONS, type SortOption } from '@/lib/catalogue/params';

const MESSAGE_KEYS: Readonly<Record<SortOption, string>> = {
  featured: 'sortFeatured',
  price_asc: 'sortPriceAsc',
  price_desc: 'sortPriceDesc',
  newest: 'sortNewest',
};

interface SortMenuProps {
  readonly value: SortOption;
  readonly onChange: (value: SortOption) => void;
}

/** "Sort ⌄" disclosure with a menuitemradio list; the trigger names the active sort once it moves off the default. */
export function SortMenu({ value, onChange }: SortMenuProps) {
  const t = useTranslations('catalogue');
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[SORT_OPTIONS.indexOf(value)]?.focus();
  }, [open, value]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (option: SortOption) => {
    close();
    if (option !== value) onChange(option);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = itemRefs.current.findIndex((item) => item === document.activeElement);
    const last = SORT_OPTIONS.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: focused >= last ? 0 : focused + 1,
      ArrowUp: focused <= 0 ? last : focused - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <div ref={anchorRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="sort-trigger"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-transparent px-2.5 text-small font-medium text-text transition-colors duration-fast ease-out hover:border-hairline hover:bg-surface"
      >
        {value === DEFAULT_SORT ? t('sortBy') : t(MESSAGE_KEYS[value])}
        <Icon name="chevron" size={16} direction={open ? 'up' : 'down'} className="text-muted" />
      </button>

      <Popover open={open} onClose={close} anchorRef={anchorRef} align="end" testId="sort-menu">
        <div id={menuId} role="menu" aria-label={t('sortBy')} onKeyDown={onMenuKeyDown}>
          {SORT_OPTIONS.map((option, index) => {
            const checked = option === value;
            return (
              <button
                key={option}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => select(option)}
                data-testid={`sort-option-${option}`}
                className={cx(
                  'flex w-full items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2.5 text-left text-small transition-colors duration-fast ease-out hover:bg-bg',
                  checked ? 'font-medium text-text' : 'text-muted hover:text-text',
                )}
              >
                <Icon name="check" size={16} className={checked ? '' : 'invisible'} />
                {t(MESSAGE_KEYS[option])}
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}
