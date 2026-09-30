import { describe, expect, it } from 'vitest';

import {
  csvCell,
  csvDocument,
  csvLine,
  guardCell,
  isDangerousCell,
  quoteCell,
  unguardCell,
} from './csv-safe';

describe('csv-safe', () => {
  it('neutralises every dangerous prefix and leaves normal values untouched', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      expect(isDangerousCell(`${prefix}1+1`)).toBe(true);
      expect(guardCell(`${prefix}1+1`)).toBe(`'${prefix}1+1`);
    }
    expect(guardCell('Sandalwood')).toBe('Sandalwood');
    expect(guardCell('80.50')).toBe('80.50');
    expect(guardCell('')).toBe('');
    expect(guardCell(' =1')).toBe(' =1');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(quoteCell('a,b')).toBe('"a,b"');
    expect(quoteCell('say "hi"')).toBe('"say ""hi"""');
    expect(quoteCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it('builds lines and documents with BOM and CRLF', () => {
    expect(csvLine(['a', 1, null])).toBe('"a","1",""');
    expect(csvDocument(['h1', 'h2'], [['x', '-y']])).toBe('﻿"h1","h2"\r\n"x","\'-y"\r\n');
  });

  it('reverses the guard only when the apostrophe protected a dangerous value', () => {
    expect(unguardCell("'=1+1")).toBe('=1+1');
    expect(unguardCell("'plain")).toBe("'plain");
    expect(unguardCell('=1+1')).toBe('=1+1');
  });
});
