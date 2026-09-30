export type QueryValue = string | number | boolean | null | undefined;

/** Builds `?a=1&b=x` dropping empty, null and undefined values; returns '' when nothing remains. */
export const buildQuery = (params: Readonly<Record<string, QueryValue>>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
};

/** Reads only the listed keys from Next's `searchParams`, first value wins, blanks dropped. */
export const pickParams = <K extends string>(
  source: Readonly<Record<string, string | string[] | undefined>>,
  keys: readonly K[],
): Readonly<Partial<Record<K, string>>> =>
  keys.reduce<Partial<Record<K, string>>>((acc, key) => {
    const raw = source[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value === undefined || value === '' ? acc : { ...acc, [key]: value };
  }, {});

const PAGE_MIN = 1;

export const parsePage = (value: string | undefined): number => {
  const page = Number.parseInt(value ?? '', 10);
  return Number.isInteger(page) && page >= PAGE_MIN ? page : PAGE_MIN;
};
