import { describe, expect, it } from 'vitest';

import { AppError } from '../errors';

import { add, formatINR, mulQty, paise, paiseToRupeesString, rupeesToPaise, sub } from './index';

describe('rupeesToPaise', () => {
  it.each([
    ['80', 8000],
    ['80.5', 8050],
    ['80.55', 8055],
    ['0', 0],
    ['0.05', 5],
    [' 12.30 ', 1230],
    ['1234567.89', 123456789],
  ])('converts %s exactly to %d paise', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(['80.555', 'abc', '', '-1', '1e3', '₹80', '80.', '.5', '1,000', '+5'])(
    'rejects %j',
    (input) => {
      expect(() => rupeesToPaise(input)).toThrow(AppError);
    },
  );
});

describe('formatINR', () => {
  it.each([
    [0, '₹0.00'],
    [999, '₹9.99'],
    [100000, '₹1,000.00'],
    [12345678, '₹1,23,456.78'],
    [1234567890, '₹1,23,45,678.90'],
    [-12345, '-₹123.45'],
    [5, '₹0.05'],
  ])('formats %d as %s with Indian grouping', (input, expected) => {
    expect(formatINR(paise(input))).toBe(expected);
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatINR(10.5)).toThrow(AppError);
  });
});

describe('paiseToRupeesString', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [8050, '80.50'],
    [1234567890, '12345678.90'],
    [-12345, '-123.45'],
  ])('formats %d as %s without symbol or grouping', (input, expected) => {
    expect(paiseToRupeesString(paise(input))).toBe(expected);
  });

  it('round-trips through rupeesToPaise and rejects non-integers', () => {
    expect(rupeesToPaise(paiseToRupeesString(paise(8050)))).toBe(8050);
    expect(() => paiseToRupeesString(1.5)).toThrow(AppError);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts integer paise', () => {
    expect(add(paise(100), paise(250))).toBe(350);
    expect(sub(paise(100), paise(250))).toBe(-150);
  });

  it('multiplies by a quantity', () => {
    expect(mulQty(paise(8000), 3)).toBe(24000);
    expect(mulQty(paise(8000), 0)).toBe(0);
  });

  it('rejects non-integer operands', () => {
    expect(() => add(1.5 as never, paise(1))).toThrow(AppError);
    expect(() => add(paise(1), 1.5 as never)).toThrow(AppError);
    expect(() => sub(1.5 as never, paise(1))).toThrow(AppError);
    expect(() => sub(paise(1), 1.5 as never)).toThrow(AppError);
    expect(() => mulQty(1.5 as never, 2)).toThrow(AppError);
    expect(() => mulQty(paise(100), 1.5)).toThrow(AppError);
    expect(() => mulQty(paise(100), -1)).toThrow(AppError);
    expect(() => paise(Number.MAX_SAFE_INTEGER + 2)).toThrow(AppError);
  });
});
