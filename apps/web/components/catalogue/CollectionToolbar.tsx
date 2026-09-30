'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { useRouter } from '@/i18n/navigation';
import type { CollectionParams } from '@/lib/catalogue/params';
import type { PriceSpread } from '@/lib/catalogue/price-range';
import { buildAllProductsUrl, buildCollectionUrl } from '@/lib/catalogue/urls';
import { formatWholeRupees } from '@/lib/format';

import { PriceFilter } from './PriceFilter';
import { SortMenu } from './SortMenu';
import { ViewToggle } from './ViewToggle';

interface CollectionToolbarProps {
  readonly total: number;
  readonly locale: string;
  /** Collection slug, or null on the all-products listing. */
  readonly slug: string | null;
  readonly currentParams: CollectionParams;
  readonly priceBounds: PriceSpread | null;
}

const TRIGGER =
  'inline-flex min-h-9 items-center gap-1.5 rounded-control border border-transparent px-2.5 text-small font-medium text-text transition-colors duration-fast ease-out hover:border-hairline hover:bg-surface';

/**
 * One-line listing toolbar: filter on the left, count + sort + view on the right. The price filter
 * opens a popover on desktop and a drawer on small screens; an applied range shows as a
 * dismissible chip (≥ md) and as a count badge on the trigger below that.
 */
export function CollectionToolbar({
  total,
  locale,
  slug,
  currentParams,
  priceBounds,
}: CollectionToolbarProps) {
  const t = useTranslations('catalogue');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const filterAnchorRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  const pushParams = (patch: Partial<CollectionParams>) => {
    const next = { ...currentParams, ...patch, page: 1 };
    router.push(
      slug === null ? buildAllProductsUrl(locale, next) : buildCollectionUrl(locale, slug, next),
    );
  };

  const closePopover = () => {
    setPopoverOpen(false);
    filterTriggerRef.current?.focus();
  };

  const applyPrice = (min: number, max: number) => {
    pushParams({ min, max });
    setPopoverOpen(false);
    setDrawerOpen(false);
  };

  const { min, max } = currentParams;
  const filterActive = min > 0 || max > 0;
  const chipLabel =
    min > 0 && max > 0
      ? `${formatWholeRupees(min * 100)} – ${formatWholeRupees(max * 100)}`
      : min > 0
        ? t('priceOver', { amount: formatWholeRupees(min * 100) })
        : t('priceUnder', { amount: formatWholeRupees(max * 100) });

  const priceFilter = (
    <PriceFilter
      key={`${min}-${max}`}
      min={min}
      max={max}
      bounds={priceBounds}
      slug={slug}
      total={total}
      onApply={applyPrice}
    />
  );

  return (
    <div
      className="mt-6 flex items-center justify-between gap-3 border-y border-hairline py-2"
      data-testid="collection-toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Below md the trigger opens the drawer; from md up, the anchored popover. */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          data-testid="filter-trigger-mobile"
          className={`${TRIGGER} md:hidden`}
        >
          <Icon name="sliders" size={16} className="text-muted" />
          {t('filter')}
          {filterActive && <FilterCount />}
        </button>

        <div ref={filterAnchorRef} className="relative hidden md:block">
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => (popoverOpen ? closePopover() : setPopoverOpen(true))}
            aria-expanded={popoverOpen}
            data-testid="filter-trigger"
            className={TRIGGER}
          >
            <Icon name="sliders" size={16} className="text-muted" />
            {t('filter')}
            <Icon
              name="chevron"
              size={16}
              direction={popoverOpen ? 'up' : 'down'}
              className="text-muted"
            />
          </button>
          <Popover
            open={popoverOpen}
            onClose={closePopover}
            anchorRef={filterAnchorRef}
            testId="filter-popover"
            className="w-72 p-3.5"
          >
            {priceFilter}
          </Popover>
        </div>

        {filterActive && (
          <PriceChip
            label={chipLabel}
            removeLabel={t('removePriceFilter')}
            onRemove={() => pushParams({ min: 0, max: 0 })}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-small text-muted sm:block" data-testid="toolbar-count">
          {t('itemCount', { count: total })}
        </span>
        <SortMenu value={currentParams.sort} onChange={(sort) => pushParams({ sort })} />
        <ViewToggle value={currentParams.view} onChange={(view) => pushParams({ view })} />
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('filter')}
        side="left"
      >
        {priceFilter}
      </Drawer>
    </div>
  );
}

interface PriceChipProps {
  readonly label: string;
  readonly removeLabel: string;
  readonly onRemove: () => void;
}

/** The applied range as a dismissible pill; hidden below md, where the trigger badge takes over. */
function PriceChip({ label, removeLabel, onRemove }: PriceChipProps) {
  return (
    <span
      className="hidden min-w-0 items-center gap-1.5 rounded-full border border-hairline bg-surface py-1 pl-3 pr-1.5 text-small text-text md:inline-flex"
      data-testid="price-chip"
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted transition-colors duration-fast ease-out hover:bg-bg hover:text-text"
        data-testid="price-chip-remove"
      >
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}

/** Applied-filter count on the mobile trigger, where the chip is hidden. */
function FilterCount() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold leading-none text-accent-contrast"
    >
      1
    </span>
  );
}
