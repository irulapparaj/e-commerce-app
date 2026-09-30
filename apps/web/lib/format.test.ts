import { describe, expect, it } from 'vitest';

import {
  discountPercent,
  formatCartCount,
  formatCount,
  formatINR,
  formatPrice,
  formatWholeRupees,
} from './format';

describe('format', () => {
  it('formats paise with Indian grouping', () => {
    expect(formatPrice(8000)).toBe('₹80.00');
    expect(formatPrice(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(5)).toBe('₹0.05');
  });

  it('formats counts for en-IN', () => {
    expect(formatCount(1234567)).toBe('12,34,567');
  });

  it('caps the cart badge at 99+', () => {
    expect(formatCartCount(0)).toBe('0');
    expect(formatCartCount(7.9)).toBe('7');
    expect(formatCartCount(-2)).toBe('0');
    expect(formatCartCount(99)).toBe('99');
    expect(formatCartCount(100)).toBe('99+');
  });
  it('drops the paise for whole-rupee amounts only', () => {
    expect(formatWholeRupees(59900)).toBe('₹599');
    expect(formatWholeRupees(59950)).toBe('₹599.50');
    expect(formatWholeRupees(123456700)).toBe('₹12,34,567');
  });

  it('computes a whole-number discount only when the compare-at price is really higher', () => {
    expect(discountPercent(8000, 9500)).toBe(16);
    expect(discountPercent(69900, 89900)).toBe(22);
    expect(discountPercent(8000, null)).toBeNull();
    expect(discountPercent(8000, 8000)).toBeNull();
    expect(discountPercent(8000, 7000)).toBeNull();
    expect(discountPercent(9999, 10000)).toBeNull();
  });
});
