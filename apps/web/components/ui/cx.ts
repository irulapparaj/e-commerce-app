export type ClassValue = string | false | null | undefined;

/** Joins conditional class names; falsy entries drop out. */
export const cx = (...values: readonly ClassValue[]): string =>
  values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
