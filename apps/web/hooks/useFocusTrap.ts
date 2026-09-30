'use client';

import { useCallback, useEffect, useRef } from 'react';

interface UseModalOptions {
  /** Called when the modal should close (Escape key, overlay click). */
  onClose: () => void;
  /** Whether the modal is currently open. */
  isOpen: boolean;
}

interface UseModalReturn {
  /** Ref to attach to the modal container element. */
  modalRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to the element that triggered opening the modal. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Provides focus trapping and focus restore behaviour for modal dialogs.
 *
 * On open:
 *   - Moves focus to the first focusable element inside the modal.
 *   - Sets `inert` on the rest of the page (siblings of the modal container).
 *   - Traps Tab / Shift+Tab within the modal.
 *   - Closes on Escape.
 *
 * On close:
 *   - Removes `inert` from page siblings.
 *   - Restores focus to the trigger element.
 */
export function useFocusTrap({ isOpen, onClose }: UseModalOptions): UseModalReturn {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Apply / remove `inert` on page siblings and move focus into the modal.
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const bodyChildren = Array.from(document.body.children) as HTMLElement[];
    const siblings = bodyChildren.filter((el) => !el.contains(modal));

    // Mark background content as inert so AT and keyboard cannot reach it.
    for (const sibling of siblings) {
      sibling.setAttribute('inert', '');
    }

    // Move focus into the modal.
    const focusable = modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    const firstFocusable = focusable[0];
    if (firstFocusable !== undefined) {
      firstFocusable.focus();
    } else {
      modal.focus();
    }

    return () => {
      // Restore background content.
      for (const sibling of siblings) {
        sibling.removeAttribute('inert');
      }
    };
  }, [isOpen]);

  // Restore focus to the trigger when the modal closes.
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  // Trap focus within the modal via Tab / Shift+Tab, close on Escape.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen || !modalRef.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const modal = modalRef.current;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
        (el) => !el.closest('[inert]'),
      );

      if (focusable.length === 0) return;

      const first: HTMLElement | undefined = focusable[0];
      const last: HTMLElement | undefined = focusable[focusable.length - 1];

      if (first === undefined || last === undefined) return;

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { modalRef, triggerRef };
}
