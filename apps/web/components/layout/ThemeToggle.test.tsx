// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { ThemeToggle } from './ThemeToggle';

const matchMedia = (matches: boolean) =>
  vi.fn((query: string) => ({ matches, media: query }) as unknown as MediaQueryList);

/** Node 25 ships a non-functional `localStorage` global that shadows jsdom's; tests bring their own. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
};

describe('ThemeToggle', () => {
  beforeEach(() => {
    delete document.documentElement.dataset['theme'];
    document.cookie = 'theme=; Max-Age=0; Path=/';
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('matchMedia', matchMedia(false));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('flips data-theme, the cookie and localStorage from the server hint', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ThemeToggle initialTheme="light" />);

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.cookie).toContain('theme=dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
      'data-theme-state',
      'dark',
    );

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.cookie).toContain('theme=light');
  });

  it('survives localStorage throwing on read and write', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    renderWithIntl(<ThemeToggle initialTheme={null} />);

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.cookie).toContain('theme=dark');
  });

  it('survives localStorage access itself throwing', async () => {
    const user = userEvent.setup();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    try {
      renderWithIntl(<ThemeToggle initialTheme={null} />);
      await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
      expect(document.documentElement.dataset['theme']).toBe('dark');
      expect(document.cookie).toContain('theme=dark');
    } finally {
      if (descriptor !== undefined) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });

  it('follows the OS preference when there is no hint, and a stored choice over the OS', () => {
    vi.stubGlobal('matchMedia', matchMedia(true));
    const { unmount } = renderWithIntl(<ThemeToggle initialTheme={null} />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    unmount();

    window.localStorage.setItem('theme', 'light');
    renderWithIntl(<ThemeToggle initialTheme={null} />);
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
