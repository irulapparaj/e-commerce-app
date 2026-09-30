import { persistPreference, type ThemeSinks } from './theme';

/**
 * The second attribute axis next to `[data-theme]`: a skin re-maps the same tokens to a new palette,
 * type and shapes in styles/skins.css. Nothing here is skin-specific beyond the id — the ids drive
 * the CSS blocks, the `appearance.skins` strings and the fonts in app/(storefront)/fonts.ts.
 */
export const SKIN_IDS = [
  'classic',
  'mandir-gold',
  'pushpa-purity',
  'utsav-rang',
  'sandhya-aarti',
] as const;

export type SkinId = (typeof SKIN_IDS)[number];

/** The design shipped in tokens.css; also the fallback for an unknown or missing cookie. */
export const DEFAULT_SKIN: SkinId = 'classic';

/** Cookie read by the `[locale]` layout so SSR renders `data-skin` and nobody sees the default flash by. */
export const SKIN_COOKIE = 'skin';
export const SKIN_STORAGE_KEY = 'skin';

const isSkinId = (value: string): value is SkinId =>
  (SKIN_IDS as readonly string[]).includes(value);

export const parseSkin = (value: string | null | undefined): SkinId | null =>
  typeof value === 'string' && isSkinId(value) ? value : null;

/** `undefined` for the default so the base tokens apply with no attribute at all. */
export const skinAttribute = (skin: SkinId | null): SkinId | undefined =>
  skin === null || skin === DEFAULT_SKIN ? undefined : skin;

export const readStoredSkin = (storage: Pick<Storage, 'getItem'> | undefined): SkinId | null => {
  try {
    return parseSkin(storage?.getItem(SKIN_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const persistSkin = (skin: SkinId, sinks: ThemeSinks): void =>
  persistPreference(SKIN_COOKIE, skin, sinks);

export const applySkin = (root: { dataset: DOMStringMap }, skin: SkinId): void => {
  const value = skinAttribute(skin);
  if (value === undefined) delete root.dataset['skin'];
  else root.dataset['skin'] = value;
};
