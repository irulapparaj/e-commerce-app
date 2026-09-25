import { describe, expect, it } from 'vitest';

import { formatOrderNumber, istYear, ORDER_NUMBER_PATTERN } from './order-number';

describe('formatOrderNumber', () => {
  it('zero-pads to four digits and grows past 9999 without truncation', () => {
    expect(formatOrderNumber(2026, 1)).toBe('PE-20260001');
    expect(formatOrderNumber(2026, 9999)).toBe('PE-20269999');
    expect(formatOrderNumber(2026, 10000)).toBe('PE-202610000');
    expect(formatOrderNumber(2027, 1)).toBe('PE-20270001');
  });

  it('matches the documented pattern', () => {
    expect(ORDER_NUMBER_PATTERN.test('PE-20260001')).toBe(true);
    expect(ORDER_NUMBER_PATTERN.test('PE-2026001')).toBe(false);
  });
});

describe('istYear', () => {
  it('rolls the year over at midnight IST, not UTC', () => {
    expect(istYear(new Date('2026-12-31T18:29:59Z'))).toBe(2026);
    expect(istYear(new Date('2026-12-31T18:30:00Z'))).toBe(2027);
  });
});
