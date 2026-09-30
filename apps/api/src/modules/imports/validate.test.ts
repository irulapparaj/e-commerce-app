import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseImportFile } from './parse';
import { stockDelta, type ValidationContext, validateRows } from './validate';

const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/imports');
const load = (name: string) =>
  parseImportFile(readFileSync(resolve(FIXTURES, name)), 'text/csv', { maxRows: 5_000 });

const ctx = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  categorySlugs: new Set(['agarbatti']),
  products: new Map(),
  variants: new Map(),
  ...overrides,
});

describe('validateRows', () => {
  it('classifies a clean file as creates with full stock deltas', async () => {
    const { rows } = await load('valid.csv');

    const outcome = validateRows(rows, ctx());

    expect(outcome).toMatchObject({ totalRows: 5, okRows: 5, errorRows: 0, errors: [] });
    expect(outcome.report.creates).toEqual([
      { sku: 'IMP-AG-001', name: 'Import Sandalwood Agarbatti', variants: 2 },
      { sku: 'IMP-CM-002', name: 'Import Pure Camphor', variants: 2 },
      { sku: 'IMP-DH-003', name: 'Import "Loban" Dhoop', variants: 1 },
    ]);
    expect(outcome.report.updates).toEqual([]);
    expect(outcome.report.stockDeltas).toEqual([
      { variantSku: 'IMP-AG-001-20', current: 0, target: 120, delta: 120 },
      { variantSku: 'IMP-AG-001-50', current: 0, target: 60, delta: 60 },
      { variantSku: 'IMP-CM-002-50', current: 0, target: 200, delta: 200 },
      { variantSku: 'IMP-DH-003-1', current: 0, target: 30, delta: 30 },
    ]);
    expect(outcome.groups.map((group) => group.exists)).toEqual([false, false, false]);
  });

  it('classifies existing skus as updates and computes deltas against current stock', async () => {
    const { rows } = await load('valid.csv');
    const outcome = validateRows(
      rows,
      ctx({
        products: new Map([['IMP-AG-001', { id: 'p1', name: 'Old name' }]]),
        variants: new Map([
          ['IMP-AG-001-20', { id: 'v1', productSku: 'IMP-AG-001', stock: 120 }],
          ['IMP-AG-001-50', { id: 'v2', productSku: 'IMP-AG-001', stock: 100 }],
        ]),
      }),
    );

    expect(outcome.report.updates).toEqual([
      { sku: 'IMP-AG-001', name: 'Import Sandalwood Agarbatti', variants: 2 },
    ]);
    expect(outcome.report.creates).toHaveLength(2);
    expect(outcome.report.stockDeltas[0]).toEqual({
      variantSku: 'IMP-AG-001-50',
      current: 100,
      target: 60,
      delta: -40,
    });
  });

  it('reports every row problem with line numbers and drops affected groups from the report', async () => {
    const { rows } = await load('bad-rows.csv');

    const outcome = validateRows(rows, ctx());

    expect(outcome).toMatchObject({ totalRows: 6, okRows: 2, errorRows: 4 });
    expect(outcome.errors).toEqual([
      {
        line: 3,
        field: 'name',
        message: 'Differs from row 2 for sku IMP-BAD-1',
        value: 'Bad Price Different Name',
      },
      {
        line: 4,
        field: 'category_slug',
        message: expect.stringMatching(/Unknown category/),
        value: 'no-such-category',
      },
      {
        line: 5,
        field: 'variant_sku',
        message: 'Duplicate variant_sku (also on row 2)',
        value: 'IMP-BAD-1-A',
      },
      { line: 6, field: 'gst_rate', message: expect.any(String), value: '28' },
      { line: 6, field: 'is_active', message: expect.any(String), value: 'maybe' },
      { line: 6, field: 'stock', message: 'Must be a whole number', value: '-3' },
    ]);
    expect(outcome.report.creates).toEqual([{ sku: 'IMP-OK-5', name: 'Fine Row', variants: 1 }]);
    expect(outcome.groups.map((group) => group.sku)).toEqual(['IMP-OK-5']);
  });

  it('refuses a variant that already belongs to another product', async () => {
    const { rows } = await load('valid.csv');
    const outcome = validateRows(
      rows,
      ctx({
        variants: new Map([['IMP-DH-003-1', { id: 'v9', productSku: 'OTHER', stock: 1 }]]),
      }),
    );

    expect(outcome.errors).toEqual([
      {
        line: 6,
        field: 'variant_sku',
        message: 'Variant already belongs to product OTHER',
        value: 'IMP-DH-003-1',
      },
    ]);
  });

  it('computes stock deltas from target and current, including the equal case', () => {
    expect(stockDelta('v', 10, 4)).toEqual({ variantSku: 'v', current: 4, target: 10, delta: 6 });
    expect(stockDelta('v', 4, 10)).toEqual({ variantSku: 'v', current: 10, target: 4, delta: -6 });
    expect(stockDelta('v', 0, 3)).toEqual({ variantSku: 'v', current: 3, target: 0, delta: -3 });
    expect(stockDelta('v', 7, 7)).toBeNull();
  });
});
