'use client';

import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef } from 'react';

interface DialogProps {
  readonly open: boolean;
  readonly titleId: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly describedBy?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly testId?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (root: HTMLElement | null): readonly HTMLElement[] =>
  root === null ? [] : Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

/** Accessible modal: labelled, focus moved in (prefers `[data-autofocus]`), trapped, restored on close. */
export function Dialog({
  open,
  titleId,
  onClose,
  children,
  describedBy,
  size = 'md',
  testId,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? null;
    (preferred ?? focusables(panel)[0] ?? panel)?.focus();
    return () => {
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(panelRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="admin-dialog-backdrop" onMouseDown={onBackdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className={`admin-dialog admin-dialog-${size}`}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}
