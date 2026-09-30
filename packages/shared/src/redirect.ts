/** Relative-path-only login redirects (DESIGN §11.3): no scheme, no `//`, no backslash, no `@`. */
export const REDIRECT_PATTERN = /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/;

export const DEFAULT_REDIRECT = { customer: '/account', admin: '/admin' } as const;

export const isSafeRedirect = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && REDIRECT_PATTERN.test(value);

export const validateRedirect = (value: unknown, fallback: string): string =>
  isSafeRedirect(value) ? value : fallback;
