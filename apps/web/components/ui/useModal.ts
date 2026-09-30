import { type RefObject, useEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusables = (root: HTMLElement | null): readonly HTMLElement[] =>
  root === null ? [] : Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

/** Portals cannot render on the server; overlays mount only after hydration. */
export const useMounted = (): boolean => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
};

const trapTab = (event: KeyboardEvent, panel: HTMLElement): void => {
  const items = focusables(panel);
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

export interface UseModalOptions {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly panelRef: RefObject<HTMLElement | null>;
}

/**
 * Modal behaviour for Drawer and Dialog: everything outside the overlay becomes `inert`, focus
 * moves in (`[data-autofocus]` first), Tab wraps, Escape closes, body scroll locks, and focus
 * returns to the opener on close.
 */
export const useModal = ({ open, onClose, panelRef }: UseModalOptions): void => {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || panel === null) return undefined;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlayRoot = panel.closest<HTMLElement>('[data-modal-root]') ?? panel;
    const madeInert = Array.from(document.body.children).filter(
      (element) => element !== overlayRoot && !element.hasAttribute('inert'),
    );
    for (const element of madeInert) element.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(panel)[0] ?? panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === 'Tab') trapTab(event, panel);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const element of madeInert) element.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open, panelRef]);
};
