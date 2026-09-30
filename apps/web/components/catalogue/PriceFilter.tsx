'use client';

import { useTranslations } from 'next-intl';
import { type ChangeEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import {
  clampToBounds,
  type PriceSpread,
  type RupeeBounds,
  sliderStep,
  thumbsFor,
} from '@/lib/catalogue/price-range';
import { useMatchCount } from './useMatchCount';
import { formatWholeRupees } from '@/lib/format';

interface PriceFilterProps {
  /** Applied URL values in rupees; 0 means unset. */
  readonly min: number;
  readonly max: number;
  /** Unfiltered price spread of the listing; null hides the histogram/slider, leaving the inputs. */
  readonly bounds: PriceSpread | null;
  /** Collection scope (null on all-products) and its current result count for the live preview. */
  readonly slug: string | null;
  readonly total: number;
  readonly onApply: (min: number, max: number) => void;
}

const parseRupees = (raw: string): number | null => {
  if (raw === '') return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 && String(value) === raw ? value : null;
};

/** Popover-scale input: the 44px page-form control is too heavy inside a filter panel. */
const COMPACT_INPUT =
  'h-10 w-full rounded-control border border-hairline bg-surface px-3 text-small text-text transition-colors duration-fast ease-out placeholder:text-muted hover:border-muted focus-visible:border-text aria-[invalid=true]:border-critical [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const MIN_BAR_HEIGHT_PCT = 8;

interface HistogramProps {
  readonly spread: PriceSpread;
  readonly lo: number;
  readonly hi: number;
}

/**
 * Inventory density over the price axis, drawn flush above the slider track. Bars inside the
 * selection take the accent so dragging shows at a glance how much the range excludes. Decorative:
 * the slider's value text carries the same information for assistive tech.
 */
function Histogram({ spread, lo, hi }: HistogramProps) {
  const peak = Math.max(...spread.buckets, 0);
  if (peak <= 0) return null;
  const bucketWidth = (spread.max - spread.min) / spread.buckets.length;

  return (
    <div className="flex h-9 items-end gap-px" data-testid="price-histogram" aria-hidden="true">
      {spread.buckets.map((count, index) => {
        const mid = spread.min + (index + 0.5) * bucketWidth;
        const inRange = mid >= lo && mid <= hi;
        return (
          <span
            // Buckets are positional by nature; the index is their identity.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            data-in-range={inRange}
            className={cx(
              'flex-1 rounded-t-[2px] transition-colors duration-fast ease-out',
              inRange ? 'bg-accent' : 'bg-hairline',
            )}
            style={{
              height: count > 0 ? `${Math.max((count / peak) * 100, MIN_BAR_HEIGHT_PCT)}%` : '2px',
            }}
          />
        );
      })}
    </div>
  );
}

interface RangeSliderProps {
  readonly bounds: RupeeBounds;
  readonly thumbs: { readonly lo: number; readonly hi: number };
  readonly onThumb: (which: 'lo' | 'hi', value: number) => void;
}

/** Two stacked native ranges over one drawn track; only the thumbs take pointer events. */
function RangeSlider({ bounds, thumbs, onThumb }: RangeSliderProps) {
  const t = useTranslations('catalogue');
  const pct = (value: number) => ((value - bounds.min) / (bounds.max - bounds.min)) * 100;
  const shared = { min: bounds.min, max: bounds.max, step: sliderStep(bounds) };

  return (
    <div className="relative h-5 touch-none" data-testid="price-slider">
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hairline" />
      <div
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: `${pct(thumbs.lo)}%`, right: `${100 - pct(thumbs.hi)}%` }}
      />
      <input
        type="range"
        className="range-thumb"
        // When both thumbs sit high, the min thumb must win the stack or it can never move again.
        style={{ zIndex: thumbs.lo > (bounds.min + bounds.max) / 2 ? 3 : 1 }}
        {...shared}
        value={thumbs.lo}
        onChange={(e) => onThumb('lo', Number(e.target.value))}
        aria-label={t('sliderMin')}
        aria-valuetext={formatWholeRupees(thumbs.lo * 100)}
        data-testid="price-slider-min"
      />
      <input
        type="range"
        className="range-thumb z-[2]"
        {...shared}
        value={thumbs.hi}
        onChange={(e) => onThumb('hi', Number(e.target.value))}
        aria-label={t('sliderMax')}
        aria-valuetext={formatWholeRupees(thumbs.hi * 100)}
        data-testid="price-slider-max"
      />
    </div>
  );
}

interface PanelHeaderProps {
  readonly label: string;
  readonly bounds: RupeeBounds | null;
}

function PanelHeader({ label, bounds }: PanelHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-small font-medium text-text">{label}</span>
      {bounds !== null && (
        <span className="text-caption text-muted">
          {formatWholeRupees(bounds.min * 100)} – {formatWholeRupees(bounds.max * 100)}
        </span>
      )}
    </div>
  );
}

interface PriceFieldProps {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly errorId: string | undefined;
  readonly testId: string;
}

function PriceField({ label, value, placeholder, onChange, errorId, testId }: PriceFieldProps) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-caption text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={COMPACT_INPUT}
        aria-invalid={errorId !== undefined ? true : undefined}
        aria-describedby={errorId}
        data-testid={testId}
      />
    </label>
  );
}

/**
 * Histogram, slider and text boxes over the same range: dragging recolours the bars and rewrites
 * the boxes, typing moves the thumbs (clamped for display only — typed values beyond the bounds
 * are kept). A thumb resting on its bound means "no filter", so Apply only writes actively
 * narrowed values into the URL.
 */
export function PriceFilter({ min, max, bounds, slug, total, onApply }: PriceFilterProps) {
  const t = useTranslations('catalogue');
  const errorId = useId();
  const [localMin, setLocalMin] = useState(min > 0 ? String(min) : '');
  const [localMax, setLocalMax] = useState(max > 0 ? String(max) : '');
  const [error, setError] = useState<string | undefined>();

  const parsedMin = parseRupees(localMin);
  const parsedMax = parseRupees(localMax);
  const thumbs = bounds === null ? null : thumbsFor(parsedMin ?? 0, parsedMax ?? 0, bounds);
  const isInverted = parsedMin !== null && parsedMax !== null && parsedMax > 0 && parsedMax < parsedMin;
  const count = useMatchCount({
    slug,
    min: isInverted ? null : parsedMin,
    max: isInverted ? null : parsedMax,
    appliedMin: min,
    appliedMax: max,
    appliedTotal: total,
  });

  const setThumb = (which: 'lo' | 'hi', raw: number) => {
    if (bounds === null || thumbs === null) return;
    setError(undefined);
    const value = clampToBounds(raw, bounds);
    if (which === 'lo') {
      const lo = Math.min(value, thumbs.hi);
      setLocalMin(lo > bounds.min ? String(lo) : '');
    } else {
      const hi = Math.max(value, thumbs.lo);
      setLocalMax(hi < bounds.max ? String(hi) : '');
    }
  };

  const handleApply = () => {
    if (parsedMin === null || parsedMax === null || (parsedMax > 0 && parsedMax < parsedMin)) {
      setError(t('filterRangeError'));
      return;
    }
    setError(undefined);
    // Values at or past a bound narrow nothing; keep them out of the URL.
    const nextMin = bounds !== null && parsedMin <= bounds.min ? 0 : parsedMin;
    const nextMax = bounds !== null && parsedMax >= bounds.max ? 0 : parsedMax;
    onApply(nextMin, nextMax);
  };

  const handleReset = () => {
    setLocalMin('');
    setLocalMax('');
    setError(undefined);
    if (min > 0 || max > 0) onApply(0, 0);
  };

  const isDirty = localMin !== '' || localMax !== '' || min > 0 || max > 0;
  const fieldErrorId = error !== undefined ? errorId : undefined;
  const onField =
    (set: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      setError(undefined);
    };

  return (
    <div
      role="group"
      aria-label={t('filterPrice')}
      className="flex w-full flex-col gap-3"
      data-testid="price-filter"
    >
      <PanelHeader label={t('filterPrice')} bounds={bounds} />

      {bounds !== null && thumbs !== null && (
        <div className="flex flex-col">
          <Histogram spread={bounds} lo={thumbs.lo} hi={thumbs.hi} />
          <RangeSlider bounds={bounds} thumbs={thumbs} onThumb={setThumb} />
        </div>
      )}

      <div className="flex items-end gap-2">
        <PriceField
          label={t('filterMin')}
          value={localMin}
          onChange={onField(setLocalMin)}
          placeholder={bounds !== null ? String(bounds.min) : '0'}
          errorId={fieldErrorId}
          testId="price-input-min"
        />
        <span aria-hidden="true" className="pb-2.5 leading-none text-muted">
          –
        </span>
        <PriceField
          label={t('filterMax')}
          value={localMax}
          onChange={onField(setLocalMax)}
          placeholder={bounds !== null ? String(bounds.max) : '0'}
          errorId={fieldErrorId}
          testId="price-input-max"
        />
      </div>

      {error !== undefined && (
        <p id={errorId} role="alert" className="text-caption text-critical">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={handleApply}
            data-testid="price-apply"
          >
            {count === null ? t('apply') : t('showItems', { count })}
          </Button>
        </div>
        {isDirty && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            {t('reset')}
          </Button>
        )}
      </div>
      {/* Announces the refreshed count to assistive tech without stealing focus. */}
      <span role="status" className="sr-only">
        {count === null ? '' : t('showItems', { count })}
      </span>
    </div>
  );
}
