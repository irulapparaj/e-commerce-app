import { useCallback, useEffect, useRef } from 'react';

export const HOVER_INTENT_MS = 120;

/** ←/→ wrap across the top-level items; Home/End jump. */
export const nextTriggerIndex = (key: string, index: number, count: number): number | null => {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
};

/** ↑/↓ cycle through the panel's links; returns false when the key is not handled. */
export const movePanelFocus = (panel: HTMLElement, key: string): boolean => {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return false;
  const links = Array.from(panel.querySelectorAll<HTMLElement>('a[href]'));
  const index = links.findIndex((link) => link === document.activeElement);
  if (index === -1) return false;
  const delta = key === 'ArrowDown' ? 1 : -1;
  links[(index + delta + links.length) % links.length]?.focus();
  return true;
};

export const focusFirstLink = (panel: HTMLElement | null): void => {
  panel?.querySelector<HTMLElement>('a[href]')?.focus();
};

export const triggerElements = (nav: HTMLElement | null): readonly HTMLElement[] =>
  Array.from(nav?.querySelectorAll<HTMLElement>('[data-menu-trigger]') ?? []);

/** Focus moving to `target` stays inside `root` (used to keep the panel open across Tab). */
export const staysInside = (root: HTMLElement | null, target: EventTarget | null): boolean =>
  target instanceof Node && root?.contains(target) === true;

export interface HoverIntent {
  readonly schedule: (slug: string | null) => void;
  readonly cancel: () => void;
}

/** Opens or closes 120 ms after the pointer settles, so passing over the nav does nothing. */
export const useHoverIntent = (apply: (slug: string | null) => void): HoverIntent => {
  const timer = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const schedule = useCallback(
    (slug: string | null) => {
      cancel();
      timer.current = window.setTimeout(() => apply(slug), HOVER_INTENT_MS);
    },
    [apply, cancel],
  );
  useEffect(() => cancel, [cancel]);
  return { schedule, cancel };
};
