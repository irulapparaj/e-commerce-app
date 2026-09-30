export interface DiffRow {
  readonly key: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
}

const VALUE_KEY = '(value)';

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const formatValue = (value: unknown): string => {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Side-by-side rows for the audit drawer: one per top-level key, flagged when it changed. */
export const diffRows = (before: unknown, after: unknown): readonly DiffRow[] => {
  if (!isPlainObject(before) && !isPlainObject(after)) {
    if (before === undefined && after === undefined) return [];
    if (before === null && after === null) return [];
    return [
      {
        key: VALUE_KEY,
        before: formatValue(before),
        after: formatValue(after),
        changed: !sameValue(before, after),
      },
    ];
  }
  const left = isPlainObject(before) ? before : {};
  const right = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.map((key) => ({
    key,
    before: formatValue(left[key]),
    after: formatValue(right[key]),
    changed: !sameValue(left[key], right[key]),
  }));
};
