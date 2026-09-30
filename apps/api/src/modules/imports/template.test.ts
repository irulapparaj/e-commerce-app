import { IMPORT_COLUMNS } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { parseImportFile } from './parse';
import { buildCsvTemplate, buildXlsxTemplate, TEMPLATE_EXAMPLE_ROWS } from './template';
import { validateRows } from './validate';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('import template', () => {
  it('CSV header equals the schema columns and the example rows validate cleanly', async () => {
    const csv = buildCsvTemplate();
    const [header] = csv.replace('﻿', '').split('\r\n');

    expect(csv.startsWith('﻿')).toBe(true);
    expect(header).toBe(IMPORT_COLUMNS.map((column) => `"${column}"`).join(','));
    const parsed = await parseImportFile(Buffer.from(csv, 'utf8'), 'text/csv', { maxRows: 10 });
    const outcome = validateRows(parsed.rows, {
      categorySlugs: new Set(['agarbatti']),
      products: new Map(),
      variants: new Map(),
    });
    expect(parsed.rows.map((row) => row.cells)).toEqual(TEMPLATE_EXAMPLE_ROWS);
    expect(outcome.errors).toEqual([]);
  });

  it('XLSX template uses text columns and parses to the same rows', async () => {
    const workbook = await buildXlsxTemplate();
    const parsed = await parseImportFile(workbook, XLSX, { maxRows: 10 });

    expect(parsed.rows.map((row) => row.cells)).toEqual(TEMPLATE_EXAMPLE_ROWS);
    expect(parsed.rows[0]?.cells.price_inr).toBe('80.00');
  });
});
