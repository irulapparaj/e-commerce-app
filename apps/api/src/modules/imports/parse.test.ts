import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { IMPORT_COLUMNS } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { detectFormat, hasForbiddenWorkbookParts, mapHeader, parseImportFile } from './parse';

const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/imports');
const fixture = (name: string): Buffer => readFileSync(resolve(FIXTURES, name));
const CSV = 'text/csv';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OPTIONS = { maxRows: 5_000 };
const csvOf = (lines: readonly string[]): Buffer => Buffer.from(lines.join('\n'), 'utf8');
const HEADER = IMPORT_COLUMNS.join(',');

describe('parseImportFile', () => {
  it('parses the CSV fixture as strings, strips the BOM and numbers rows from 2', async () => {
    const parsed = await parseImportFile(fixture('valid.csv'), CSV, OPTIONS);

    expect(parsed.format).toBe('csv');
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows[0]).toMatchObject({
      line: 2,
      cells: { sku: 'IMP-AG-001', price_inr: '80.50' },
    });
    expect(parsed.rows[4]?.cells).toMatchObject({
      name: 'Import "Loban" Dhoop',
      description_text: '=HYPERLINK("http://evil.example")',
      low_stock_threshold: '',
    });
  });

  it('parses the XLSX fixture identically to the CSV one', async () => {
    const [csv, xlsx] = await Promise.all([
      parseImportFile(fixture('valid.csv'), CSV, OPTIONS),
      parseImportFile(fixture('valid.xlsx'), XLSX, OPTIONS),
    ]);

    expect(xlsx.format).toBe('xlsx');
    expect(xlsx.rows).toEqual(csv.rows);
  });

  it('never evaluates formulas: a formula cell becomes its literal text', async () => {
    const parsed = await parseImportFile(fixture('formula.xlsx'), XLSX, OPTIONS);

    expect(parsed.rows[0]?.cells.name).toBe('="Formula "&"Name"');
    expect(parsed.rows[0]?.cells.price_inr).toBe('=1+1');
  });

  it('keeps leading zeros and treats "007" as text', async () => {
    const parsed = await parseImportFile(
      csvOf([HEADER, ['007', ...Array.from({ length: 19 }, () => 'x')].join(',')]),
      CSV,
      OPTIONS,
    );

    expect(parsed.rows[0]?.cells.sku).toBe('007');
  });

  it('rejects unknown, missing and duplicate columns', async () => {
    await expect(
      parseImportFile(fixture('unknown-column.csv'), CSV, OPTIONS),
    ).rejects.toMatchObject({ code: 'IMPORT_UNKNOWN_COLUMN', details: { unknown: ['price_usd'] } });
    expect(() => mapHeader(['sku', 'name'])).toThrow(/Missing column/);
    expect(() => mapHeader([...IMPORT_COLUMNS, 'sku'])).toThrow(/Duplicate/);
    expect(mapHeader(['﻿SKU ', ...IMPORT_COLUMNS.slice(1)])).toEqual([...IMPORT_COLUMNS]);
  });

  it('caps rows at the limit for CSV and XLSX', async () => {
    await expect(parseImportFile(fixture('too-many-rows.csv'), CSV, OPTIONS)).rejects.toMatchObject(
      {
        code: 'IMPORT_TOO_MANY_ROWS',
        details: { rows: 5001, max: 5000 },
      },
    );
    await expect(
      parseImportFile(fixture('valid.xlsx'), XLSX, { maxRows: 2 }),
    ).rejects.toMatchObject({ code: 'IMPORT_TOO_MANY_ROWS' });
  });

  it('skips blank rows, needs a header and at least one data row', async () => {
    const parsed = await parseImportFile(
      csvOf([HEADER, '', ['A', ...Array.from({ length: 19 }, () => '')].join(','), ',,,,']),
      CSV,
      OPTIONS,
    );
    expect(parsed.rows.map((row) => row.line)).toEqual([3]);
    await expect(parseImportFile(csvOf([HEADER]), CSV, OPTIONS)).rejects.toThrow(/no data rows/);
    await expect(parseImportFile(Buffer.from(''), CSV, OPTIONS)).rejects.toThrow(/no header/);
  });

  it('refuses content that disagrees with the declared type or carries macros/external links', async () => {
    await expect(parseImportFile(fixture('valid.xlsx'), CSV, OPTIONS)).rejects.toThrow(
      /not a UTF-8 CSV/,
    );
    await expect(parseImportFile(fixture('valid.csv'), XLSX, OPTIONS)).rejects.toThrow(
      /not a XLSX workbook/,
    );
    await expect(parseImportFile(fixture('macro.xlsx'), XLSX, OPTIONS)).rejects.toThrow(
      /macros or external links/,
    );
    await expect(parseImportFile(fixture('external-link.xlsx'), XLSX, OPTIONS)).rejects.toThrow(
      /macros or external links/,
    );
    await expect(parseImportFile(Buffer.from([0xff, 0xfe, 0x00]), CSV, OPTIONS)).rejects.toThrow(
      /not a UTF-8 CSV/,
    );
    await expect(parseImportFile(fixture('valid.csv'), 'application/pdf', OPTIONS)).rejects.toThrow(
      /Unsupported/,
    );
    expect(hasForbiddenWorkbookParts(fixture('valid.xlsx'))).toBe(false);
  });

  it('detects formats by magic bytes rather than extension', async () => {
    expect(await detectFormat(fixture('valid.xlsx'))).toBe('xlsx');
    expect(await detectFormat(fixture('valid.csv'))).toBe('csv');
    expect(await detectFormat(Buffer.from('PK\u0003\u0004not-a-workbook'))).toBeNull();
    expect(await detectFormat(readFileSync(resolve(FIXTURES, '../media/sample.png')))).toBeNull();
  });
});
