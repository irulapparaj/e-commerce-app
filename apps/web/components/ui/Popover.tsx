'use client';

import { type ReactNode, type RefObject, useEffect } from 'react';

import { cx } from './cx';

interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The wrapper holding both trigger and panel; outside-clicks are measured against it. */
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly align?: 'start' | 'end';
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly testId?: string;
}

/**
 * A small anchored panel (sort menu, filter panel) — lighter than Dialog/Drawer: no scrim, no focus
 * trap. Escape and outside-clicks close it; the caller re-focuses its trigger via `onClose`.
 * Render inside a `relative` wrapper that also contains the trigger.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  align = 'start',
  children,
  className,
  id,
  testId = 'popover',
}: PopoverProps) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (anchor !== null && event.target instanceof Node && !anchor.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      id={id}
      data-testid={testId}
      className={cx(
        'absolute top-full z-overlay mt-2 min-w-52 rounded-control border border-hairline bg-surface p-2 shadow-modal motion-safe:animate-rise-in',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
