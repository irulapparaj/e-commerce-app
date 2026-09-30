import { describe, expect, it } from 'vitest';

import { buildQuery, parsePage, pickParams } from './query';

describe('buildQuery', () => {
  it('encodes present values and drops blanks', () => {
    expect(
      buildQuery({ page: 2, action: 'settings.updated', from: '', to: undefined, x: null }),
    ).toBe('?page=2&action=settings.updated');
    expect(buildQuery({ belowThreshold: true })).toBe('?belowThreshold=true');
    expect(buildQuery({})).toBe('');
  });
});

describe('pickParams', () => {
  it('keeps only listed keys, first value of arrays, no blanks', () => {
    expect(
      pickParams({ a: 'x', b: ['y', 'z'], c: '', d: undefined, e: 'ignored' }, [
        'a',
        'b',
        'c',
        'd',
      ]),
    ).toEqual({ a: 'x', b: 'y' });
  });
});

describe('parsePage', () => {
  it('parses positive integers and falls back to page 1', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });
});
