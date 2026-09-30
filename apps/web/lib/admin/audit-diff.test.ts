import { describe, expect, it } from 'vitest';

import { diffRows, formatValue } from './audit-diff';

describe('diffRows', () => {
  it('lists the union of keys sorted and flags only the changed ones', () => {
    const rows = diffRows({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', d: true });

    expect(rows.map((row) => row.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map((row) => row.changed)).toEqual([false, true, false, true]);
    expect(rows[1]).toEqual({ key: 'b', before: 'x', after: 'y', changed: true });
    expect(rows[2]).toEqual({ key: 'c', before: 'null', after: '—', changed: false });
  });

  it('treats a missing side as empty (creates and deletes)', () => {
    expect(diffRows(null, { email: 'a@b.co' })).toEqual([
      { key: 'email', before: '—', after: 'a@b.co', changed: true },
    ]);
    expect(diffRows({ email: 'a@b.co' }, undefined)).toEqual([
      { key: 'email', before: 'a@b.co', after: '—', changed: true },
    ]);
  });

  it('shows primitive values as a single row and nothing for two empties', () => {
    expect(diffRows(59900, 79900)).toEqual([
      { key: '(value)', before: '59900', after: '79900', changed: true },
    ]);
    expect(diffRows(undefined, undefined)).toEqual([]);
    expect(diffRows(null, null)).toEqual([]);
  });

  it('compares nested values structurally', () => {
    const rows = diffRows({ lines: ['a', 'b'] }, { lines: ['a', 'b'] });

    expect(rows[0]?.changed).toBe(false);
    expect(rows[0]?.after).toBe(JSON.stringify(['a', 'b'], null, 2));
  });
});

describe('formatValue', () => {
  it('renders strings raw, undefined as a dash and everything else as JSON', () => {
    expect(formatValue('x')).toBe('x');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue(true)).toBe('true');
    expect(formatValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
