import { describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  invertTheme,
  OG_PALETTE,
  parseTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  THEME_COOKIE,
} from './theme';

describe('theme helpers', () => {
  it('parses only the two known values', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('blue')).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(invertTheme('dark')).toBe('light');
    expect(invertTheme('light')).toBe('dark');
  });

  it('reads storage defensively', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark');
    expect(readStoredTheme({ getItem: () => 'nope' })).toBeNull();
    expect(readStoredTheme(undefined)).toBeNull();
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
  });

  it('persists to storage when possible and always to the cookie', () => {
    const setItem = vi.fn();
    const doc = { cookie: '', location: { protocol: 'https:' } };

    persistTheme('dark', { storage: { setItem }, document: doc });

    expect(setItem).toHaveBeenCalledWith('theme', 'dark');
    expect(doc.cookie).toBe(`${THEME_COOKIE}=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);

    const throwing = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    const plain = { cookie: '', location: { protocol: 'http:' } };
    persistTheme('light', { storage: throwing, document: plain });
    expect(plain.cookie).toBe(`${THEME_COOKIE}=light; Path=/; Max-Age=31536000; SameSite=Lax`);

    const noLocation = { cookie: '' };
    persistTheme('light', { storage: undefined, document: noLocation });
    expect(noLocation.cookie).toContain('theme=light');
  });

  it('resolves a hint before the OS preference', () => {
    const dark = () => ({ matches: true });
    expect(resolveTheme('light', dark)).toBe('light');
    expect(resolveTheme(null, dark)).toBe('dark');
    expect(resolveTheme(null, () => ({ matches: false }))).toBe('light');
    expect(resolveTheme(null, undefined)).toBe('light');
  });

  it('applies the attribute and mirrors the light palette for OG images', () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme(root, 'dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(Object.keys(OG_PALETTE)).toEqual(['bg', 'text', 'muted', 'accent']);
  });
});
