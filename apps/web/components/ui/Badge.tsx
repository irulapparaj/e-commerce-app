import type { ReactNode } from 'react';

import { cx } from './cx';

export type BadgeTone = 'default' | 'muted' | 'success' | 'critical';

const TONES: Readonly<Record<BadgeTone, string>> = {
  default: 'text-text',
  muted: 'text-muted',
  success: 'text-success',
  critical: 'text-critical',
};

interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
}

/** "Sale", "New", "Sold out": small-caps text, never a coloured pill (DESIGN.md §16). */
export function Badge({ children, tone = 'default' }: BadgeProps) {
  return <span className={cx('small-caps text-small leading-none', TONES[tone])}>{children}</span>;
}
