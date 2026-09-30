'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { IconButton } from '@/components/ui/Button';
import { safeLocalStorage as safeStorage } from '@/lib/storage';
import {
  applyTheme,
  invertTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type Theme,
} from '@/lib/theme';

const matchMedia = (): ((query: string) => { matches: boolean }) | undefined =>
  typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined;

interface ThemeToggleProps {
  /** From the `theme` cookie the server rendered with; `null` means "follow the OS". */
  readonly initialTheme: Theme | null;
}

export function ThemeToggle({ initialTheme }: ThemeToggleProps) {
  const t = useTranslations('shell');
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'light');

  useEffect(() => {
    if (initialTheme !== null) return;
    const stored = readStoredTheme(safeStorage());
    const resolved = resolveTheme(stored, matchMedia());
    setTheme(resolved);
    if (stored !== null) applyTheme(document.documentElement, stored);
  }, [initialTheme]);

  const toggle = () => {
    const next = invertTheme(theme);
    setTheme(next);
    applyTheme(document.documentElement, next);
    persistTheme(next, { storage: safeStorage(), document });
  };

  const dark = theme === 'dark';
  return (
    <IconButton
      icon={dark ? 'sun' : 'moon'}
      label={dark ? t('themeToLight') : t('themeToDark')}
      onClick={toggle}
      data-testid="theme-toggle"
      data-theme-state={theme}
    />
  );
}
