import type { ReactNode } from 'react';

interface VisuallyHiddenProps {
  readonly children: ReactNode;
  readonly as?: 'span' | 'div' | 'p';
}

/** Screen-reader-only text (labels for icon buttons, "Sale price" before a struck-through amount). */
export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
