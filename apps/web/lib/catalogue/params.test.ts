import { describe, expect, it } from 'vitest';

import {
  parseCollectionParams,
  rupeesToPaise,
  paiseToRupees,
  DEFAULT_SORT,
  DEFAULT_VIEW,
} from './params';

describe('parseCollectionParams', () => {
  it('returns defaults for empty input', () => {
    const result = parseCollectionParams({});
    expect(result).toEqual({
      sort: DEFAULT_SORT,
      min: 0,
      max: 0,
      page: 1,
      view: DEFAULT_VIEW,
    });
  });

  it('parses valid sort', () => {
    expect(parseCollectionParams({ sort: 'price_asc' }).sort).toBe('price_asc');
    expect(parseCollectionParams({ sort: 'price_desc' }).sort).toBe('price_desc');
    expect(parseCollectionParams({ sort: 'newest' }).sort).toBe('newest');
  });

  it('falls back to default for invalid sort', () => {
    expect(parseCollectionParams({ sort: 'garbage' }).sort).toBe(DEFAULT_SORT);
    expect(parseCollectionParams({ sort: '' }).sort).toBe(DEFAULT_SORT);
  });

  it('parses valid min/max rupees', () => {
    const result = parseCollectionParams({ min: '50', max: '500' });
    expect(result.min).toBe(50);
    expect(result.max).toBe(500);
  });

  it('defaults to 0 for invalid min/max', () => {
    expect(parseCollectionParams({ min: 'abc' }).min).toBe(0);
    expect(parseCollectionParams({ max: '-1' }).max).toBe(0);
    expect(parseCollectionParams({ min: '3.7' }).min).toBe(0); // non-integer → default 0
  });

  it('parses page correctly', () => {
    expect(parseCollectionParams({ page: '3' }).page).toBe(3);
    expect(parseCollectionParams({ page: '0' }).page).toBe(1);
    expect(parseCollectionParams({ page: 'abc' }).page).toBe(1);
  });

  it('parses view', () => {
    expect(parseCollectionParams({ view: 'list' }).view).toBe('list');
    expect(parseCollectionParams({ view: 'grid' }).view).toBe('grid');
    expect(parseCollectionParams({ view: 'invalid' }).view).toBe(DEFAULT_VIEW);
  });

  it('handles array values by taking the first', () => {
    expect(parseCollectionParams({ sort: ['price_asc', 'price_desc'] }).sort).toBe('price_asc');
  });
});

describe('rupeesToPaise', () => {
  it('converts exactly', () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(50)).toBe(5000);
  });
});

describe('paiseToRupees', () => {
  it('floors to integer rupees', () => {
    expect(paiseToRupees(10050)).toBe(100);
    expect(paiseToRupees(0)).toBe(0);
    expect(paiseToRupees(5099)).toBe(50);
  });
});
