import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatCountdown,
  formatDateTime,
  formatDelta,
  formatPaise,
  maskValue,
  secondsUntil,
  toPaise,
  toRupees,
  truncate,
} from './format';

describe('formatPaise', () => {
  it('renders paise as Indian rupees with lakh grouping', () => {
    expect(formatPaise(59900)).toBe('₹599');
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(formatPaise(0)).toBe('₹0');
  });
});

describe('formatCount', () => {
  it('groups digits the Indian way', () => {
    expect(formatCount(1234567)).toBe('12,34,567');
  });
});

describe('formatDateTime', () => {
  it('formats ISO timestamps in IST and dashes anything unusable', () => {
    expect(formatDateTime('2026-09-26T00:30:00.000Z')).toMatch(/26 Sept 2026, 6:00 am/i);
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });
});

describe('formatCountdown', () => {
  it('renders mm:ss and clamps negatives to zero', () => {
    expect(formatCountdown(300)).toBe('05:00');
    expect(formatCountdown(61.9)).toBe('01:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('secondsUntil', () => {
  it('counts whole seconds to an epoch-seconds expiry and never goes negative', () => {
    expect(secondsUntil(1000, 700_000)).toBe(300);
    expect(secondsUntil(1000, 999_500)).toBe(1);
    expect(secondsUntil(1000, 2_000_000)).toBe(0);
    expect(secondsUntil(null, 0)).toBe(0);
  });
});

describe('maskValue', () => {
  it('keeps the first two and last three characters by default', () => {
    expect(maskValue('9876543210')).toBe('98•••••210');
  });

  it('fully masks values too short to keep anything', () => {
    expect(maskValue('12345')).toBe('•••••');
    expect(maskValue('')).toBe('');
  });

  it('honours custom keep counts and multi-byte characters', () => {
    expect(maskValue('T Nagar, Chennai', { keepStart: 0, keepEnd: 7 })).toBe('•••••••••Chennai');
    expect(maskValue('अनुराधा नगर', { keepStart: 1, keepEnd: 2 })).toBe('अ••••••••गर');
  });
});

describe('truncate', () => {
  it('cuts long strings with an ellipsis and leaves short ones alone', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('paise conversions', () => {
  it('rounds rupees to integer paise and back', () => {
    expect(toPaise(599)).toBe(59900);
    expect(toPaise(12.345)).toBe(1235);
    expect(toRupees(59950)).toBe(599.5);
  });
});

describe('formatDelta', () => {
  it('signs positive and negative deltas and leaves zero bare', () => {
    expect(formatDelta(150)).toBe('+150');
    expect(formatDelta(-5)).toBe('−5');
    expect(formatDelta(0)).toBe('0');
  });
});
