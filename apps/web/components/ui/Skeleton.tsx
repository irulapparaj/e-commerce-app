import { cx } from './cx';

export type SkeletonVariant = 'text' | 'heading' | 'block' | 'image' | 'circle';
export type SkeletonWidth = 'full' | 'three-quarters' | 'half' | 'third' | 'quarter';

const VARIANTS: Readonly<Record<SkeletonVariant, string>> = {
  text: 'h-4 rounded-image',
  heading: 'h-8 rounded-image',
  block: 'h-24 rounded-control',
  image: 'aspect-product w-full rounded-image',
  circle: 'size-11 rounded-full',
};

const WIDTHS: Readonly<Record<SkeletonWidth, string>> = {
  full: 'w-full',
  'three-quarters': 'w-3/4',
  half: 'w-1/2',
  third: 'w-1/3',
  quarter: 'w-1/4',
};

interface SkeletonProps {
  readonly variant?: SkeletonVariant;
  readonly width?: SkeletonWidth;
  /** Repeats the shape (paragraph lines). */
  readonly lines?: number;
}

/** Decorative placeholder while data loads; the surrounding region carries the "Loading" label. */
export function Skeleton({ variant = 'text', width = 'full', lines = 1 }: SkeletonProps) {
  const shape = cx('bg-hairline motion-safe:animate-pulse', VARIANTS[variant], WIDTHS[width]);
  if (lines <= 1)
    return <span aria-hidden="true" className={cx('block', shape)} data-testid="skeleton" />;
  return (
    <span aria-hidden="true" className="flex flex-col gap-2" data-testid="skeleton">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={cx('block', shape, index === lines - 1 && width === 'full' && 'w-2/3')}
        />
      ))}
    </span>
  );
}
