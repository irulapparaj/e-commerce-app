export type Theme = 'light' | 'dark';

/** Cookie read by the `[locale]` layout so SSR renders `data-theme` and dark users see no flash. */
export const THEME_COOKIE = 'theme';
export const THEME_STORAGE_KEY = 'theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const parseTheme = (value: string | null | undefined): Theme | null =>
  value === 'light' || value === 'dark' ? value : null;

export const invertTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');

/** `localStorage` throws in private modes and when storage is blocked; a missing value is not an error. */
export const readStoredTheme = (storage: Pick<Storage, 'getItem'> | undefined): Theme | null => {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
};

export interface ThemeSinks {
  readonly storage: Pick<Storage, 'setItem'> | undefined;
  readonly document: Pick<Document, 'cookie'> & { readonly location?: { protocol: string } };
}

/**
 * Persists a display preference (theme, skin) to storage (best effort) and to the cookie the server
 * reads on the next request. The same key names the cookie and the storage entry.
 */
export const persistPreference = (key: string, value: string, sinks: ThemeSinks): void => {
  try {
    sinks.storage?.setItem(key, value);
  } catch {
    // Storage is a convenience; the cookie below is the source of truth for SSR.
  }
  const secure = sinks.document.location?.protocol === 'https:' ? '; Secure' : '';
  sinks.document.cookie = `${key}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
};

export const persistTheme = (theme: Theme, sinks: ThemeSinks): void =>
  persistPreference(THEME_COOKIE, theme, sinks);

/** A stored/cookie hint wins; otherwise the OS preference decides. */
export const resolveTheme = (
  hint: Theme | null,
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
): Theme => hint ?? (matchMedia?.(DARK_SCHEME_QUERY).matches === true ? 'dark' : 'light');

export const applyTheme = (root: { dataset: DOMStringMap }, theme: Theme): void => {
  root.dataset['theme'] = theme;
};

/**
 * Colours for the Open Graph placeholder image. Satori rasterises outside the CSS cascade, so it
 * cannot read tokens.css; these mirror the light theme there and are the only copy in TypeScript.
 */
export const OG_PALETTE = {
  bg: '#fbfaf7',
  text: '#1c1a17',
  muted: '#6e6862',
  accent: '#d9772b',
} as const;
