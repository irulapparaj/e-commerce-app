'use client';

import { useEffect } from 'react';

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

const isModifiedClick = (event: MouseEvent): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

/**
 * Warns before the tab closes and before in-app link navigation while `active`. The app router has
 * no navigation events, so anchors are intercepted in the capture phase; Next's `<Link>` honours
 * `defaultPrevented`.
 */
export function useUnsavedChangesGuard(active: boolean, message = UNSAVED_MESSAGE): void {
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href]') ?? null;
      if (anchor === null || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (!window.confirm(message)) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, message]);
}
