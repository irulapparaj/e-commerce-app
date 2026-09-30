import { describe, expect, it, vi } from 'vitest';

import {
  applySkin,
  DEFAULT_SKIN,
  parseSkin,
  persistSkin,
  readStoredSkin,
  SKIN_COOKIE,
  SKIN_IDS,
  skinAttribute,
} from './skins';

describe('skin helpers', () => {
  it('parses only registered skin ids', () => {
    for (const id of SKIN_IDS) expect(parseSkin(id)).toBe(id);
    expect(parseSkin('neon')).toBeNull();
    expect(parseSkin('')).toBeNull();
    expect(parseSkin(undefined)).toBeNull();
    expect(parseSkin(null)).toBeNull();
  });

  it('treats the current design as the default and renders it with no attribute', () => {
    expect(DEFAULT_SKIN).toBe('classic');
    expect(SKIN_IDS).toContain(DEFAULT_SKIN);
    expect(skinAttribute(null)).toBeUndefined();
    expect(skinAttribute(DEFAULT_SKIN)).toBeUndefined();
    expect(skinAttribute('utsav-rang')).toBe('utsav-rang');
  });

  it('reads storage defensively', () => {
    expect(readStoredSkin({ getItem: () => 'utsav-rang' })).toBe('utsav-rang');
    expect(readStoredSkin({ getItem: () => 'nope' })).toBeNull();
    expect(readStoredSkin(undefined)).toBeNull();
    expect(
      readStoredSkin({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
  });

  it('persists to storage when possible and always to the cookie', () => {
    const setItem = vi.fn();
    const doc = { cookie: '', location: { protocol: 'https:' } };

    persistSkin('mandir-gold', { storage: { setItem }, document: doc });

    expect(setItem).toHaveBeenCalledWith('skin', 'mandir-gold');
    expect(doc.cookie).toBe(
      `${SKIN_COOKIE}=mandir-gold; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );

    const throwing = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    const plain = { cookie: '', location: { protocol: 'http:' } };
    persistSkin('classic', { storage: throwing, document: plain });
    expect(plain.cookie).toBe(`${SKIN_COOKIE}=classic; Path=/; Max-Age=31536000; SameSite=Lax`);
  });

  it('sets data-skin for a named skin and removes it for the default', () => {
    const root = { dataset: {} as DOMStringMap };
    applySkin(root, 'sandhya-aarti');
    expect(root.dataset['skin']).toBe('sandhya-aarti');
    applySkin(root, DEFAULT_SKIN);
    expect(root.dataset['skin']).toBeUndefined();
  });
});
