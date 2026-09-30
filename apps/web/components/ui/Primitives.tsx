import type { ReactNode } from 'react';

import { cx } from './cx';

/* Layout primitives: 1200 px content column, 8-pt rhythm, 12-column grid (DESIGN.md §16). */

type ContainerTag = 'div' | 'section' | 'nav' | 'header' | 'footer' | 'article';

interface ContainerProps {
  readonly children: ReactNode;
  readonly as?: ContainerTag;
  /** `narrow` is for reading columns (forms, policies). */
  readonly size?: 'default' | 'narrow';
  readonly id?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-label'?: string;
}

export function Container({
  children,
  as: Tag = 'div',
  size = 'default',
  ...rest
}: ContainerProps) {
  return (
    <Tag
      className={cx('mx-auto w-full px-gutter', size === 'narrow' ? 'max-w-3xl' : 'max-w-content')}
      {...rest}
    >
      {children}
    </Tag>
  );
}

interface SectionProps {
  readonly children: ReactNode;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-label'?: string;
  readonly id?: string;
  readonly space?: 'default' | 'tight' | 'none';
}

const SECTION_SPACE = { default: 'py-section', tight: 'py-8 md:py-12', none: '' } as const;

export function Section({ children, space = 'default', ...rest }: SectionProps) {
  return (
    <section className={SECTION_SPACE[space]} {...rest}>
      {children}
    </section>
  );
}

interface GridProps {
  readonly children: ReactNode;
  readonly as?: 'div' | 'ul' | 'ol';
  readonly gap?: 'default' | 'tight';
}

/** Twelve columns; children place themselves with `col-span-*`. */
export function Grid({ children, as: Tag = 'div', gap = 'default' }: GridProps) {
  return (
    <Tag
      className={cx('grid grid-cols-layout', gap === 'tight' ? 'gap-2 md:gap-4' : 'gap-4 md:gap-6')}
    >
      {children}
    </Tag>
  );
}

type StackGap = 1 | 2 | 3 | 4 | 6;
const STACK_GAP: Readonly<Record<StackGap, string>> = {
  1: 'gap-2',
  2: 'gap-4',
  3: 'gap-6',
  4: 'gap-8',
  6: 'gap-12',
};
const STACK_ALIGN = {
  start: 'items-start',
  center: 'items-center',
  stretch: 'items-stretch',
  end: 'items-end',
} as const;

interface StackProps {
  readonly children: ReactNode;
  readonly direction?: 'column' | 'row';
  /** 8-pt multiples: 1 → 8 px, 2 → 16 px, 3 → 24 px, 4 → 32 px, 6 → 48 px. */
  readonly gap?: StackGap;
  readonly align?: keyof typeof STACK_ALIGN;
  readonly wrap?: boolean;
  readonly as?: 'div' | 'ul' | 'ol' | 'nav';
}

export function Stack({
  children,
  direction = 'column',
  gap = 2,
  align = 'stretch',
  wrap = false,
  as: Tag = 'div',
}: StackProps) {
  return (
    <Tag
      className={cx(
        'flex',
        direction === 'column' ? 'flex-col' : 'flex-row',
        STACK_GAP[gap],
        STACK_ALIGN[align],
        wrap && 'flex-wrap',
      )}
    >
      {children}
    </Tag>
  );
}

interface RuleProps {
  readonly space?: 'none' | 'default' | 'section';
}

/** Hairlines separate; cards do not exist in this system. */
export function Rule({ space = 'default' }: RuleProps) {
  return (
    <hr
      className={cx(
        'border-0 border-t border-hairline',
        space === 'default' && 'my-8',
        space === 'section' && 'my-section',
      )}
    />
  );
}
