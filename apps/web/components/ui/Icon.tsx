import type { ReactNode } from 'react';

import { cx } from './cx';

export const ICON_NAMES = [
  'search',
  'heart',
  'user',
  'bag',
  'close',
  'chevron',
  'menu',
  'sun',
  'moon',
  'plus',
  'minus',
  'arrow',
  'check',
  'grid',
  'list',
  'palette',
  'truck',
  'refresh',
  'shield',
  'pin',
  'star',
  'sliders',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconSize = 16 | 20 | 24;
export type IconDirection = 'down' | 'up' | 'left' | 'right';

/** 24-unit stroke icons; a single set drawn at 1.5 px so nothing in the shell needs an icon font. */
const SYMBOLS: Readonly<Record<IconName, ReactNode>> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 12H5L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12 4 4L19 7" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-1.9 0-.9-.6-1.3-.6-2.2 0-1 .8-1.9 2-1.9H17a4 4 0 0 0 4-4c0-4.5-4-8-9-8Z" />
      <circle cx="7.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3V7Z" />
      <path d="M14 10h4l3 3v3h-7v-6Z" />
      <circle cx="7" cy="18" r="1.75" />
      <circle cx="17" cy="18" r="1.75" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7L4 16" />
      <path d="M4 20v-4h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 9.5 4-1.3 7-5 7-9.5V6l-7-3Z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
};

const DIRECTIONS: Readonly<Record<IconDirection, string>> = {
  down: '',
  up: 'rotate-180',
  left: 'rotate-90',
  right: '-rotate-90',
};

/** Rendered once in the storefront layout; every `<Icon>` references a symbol from here. */
export function IconSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute size-0 overflow-hidden"
      data-testid="icon-sprite"
    >
      {ICON_NAMES.map((name) => (
        <symbol
          key={name}
          id={`icon-${name}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {SYMBOLS[name]}
        </symbol>
      ))}
    </svg>
  );
}

interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
  /** Accessible name; omit for decorative icons next to visible text. */
  readonly label?: string;
  readonly direction?: IconDirection;
  readonly className?: string;
}

export function Icon({ name, size = 20, label, direction = 'down', className }: IconProps) {
  const decorative = label === undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={label}
      focusable="false"
      className={cx(
        'shrink-0 transition-transform duration-fast ease-out',
        DIRECTIONS[direction],
        className,
      )}
      data-icon={name}
    >
      <use href={`#icon-${name}`} />
    </svg>
  );
}
