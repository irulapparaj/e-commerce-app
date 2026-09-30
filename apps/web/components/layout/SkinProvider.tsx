'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { applySkin, DEFAULT_SKIN, persistSkin, readStoredSkin, type SkinId } from '@/lib/skins';
import { safeLocalStorage } from '@/lib/storage';

interface SkinContextValue {
  readonly skin: SkinId;
  readonly setSkin: (skin: SkinId) => void;
}

const SkinContext = createContext<SkinContextValue>({
  skin: DEFAULT_SKIN,
  setSkin: () => undefined,
});

interface SkinProviderProps {
  /** From the `skin` cookie the server rendered with; `null` means no choice has been made. */
  readonly initialSkin: SkinId | null;
  readonly children: ReactNode;
}

/**
 * The layout paints `data-skin` from the cookie; this keeps React state and the DOM attribute in step
 * afterwards. Tokens switch through CSS the moment the attribute changes; `useSkin()` is for the few
 * components that must know the active skin (the menu's checked option).
 */
export function SkinProvider({ initialSkin, children }: SkinProviderProps) {
  const [skin, setSkinState] = useState<SkinId>(initialSkin ?? DEFAULT_SKIN);

  useEffect(() => {
    if (initialSkin !== null) return;
    const stored = readStoredSkin(safeLocalStorage());
    if (stored === null || stored === DEFAULT_SKIN) return;
    setSkinState(stored);
    applySkin(document.documentElement, stored);
  }, [initialSkin]);

  const setSkin = useCallback((next: SkinId) => {
    setSkinState(next);
    applySkin(document.documentElement, next);
    persistSkin(next, { storage: safeLocalStorage(), document });
  }, []);

  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin]);
  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export const useSkin = (): SkinContextValue => useContext(SkinContext);
