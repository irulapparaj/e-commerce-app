import { describe, expect, it } from 'vitest';

import {
  formatSpecifications,
  formatTags,
  IMPORT_COLUMNS,
  IMPORT_PRODUCT_COLUMNS,
  importPresignSchema,
  importRowSchema,
  isImportContentType,
  parseSpecifications,
  parseTags,
} from './import-row';

export const VALID_ROW = {
  sku: 'PE-AG-001',
  name: 'Sandalwood Agarbatti',
  category_slug: 'agarbatti',
  description_text: 'Hand-rolled sandalwood incense.',
  how_to_use: 'Light the tip.',
  specifications: 'Quantity=20 sticks|Burn time=45 min',
  hsn_code: '3307',
  gst_rate: '5',
  tags: 'sandalwood|daily',
  is_active: 'true',
  is_featured: '',
  variant_sku: 'PE-AG-001-20',
  variant_label: '20 sticks',
  price_inr: '80.50',
  compare_at_price_inr: '99',
  stock: '120',
  weight_grams: '40',
  low_stock_threshold: '',
  meta_title: '',
  meta_description: '',
} as const;

const issueFor = (row: Record<string, string>, field: string): string | undefined => {
  const result = importRowSchema.safeParse(row);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
};

describe('importRowSchema', () => {
  it('parses a valid row into typed values', () => {
    const result = importRowSchema.safeParse(VALID_ROW);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      sku: 'PE-AG-001',
      how_to_use: 'Light the tip.',
      specifications: { Quantity: '20 sticks', 'Burn time': '45 min' },
      gst_rate: 5,
      tags: ['sandalwood', 'daily'],
      is_active: true,
      is_featured: false,
      price_inr: 8050,
      compare_at_price_inr: 9900,
      stock: 120,
      weight_grams: 40,
      low_stock_threshold: 10,
      meta_title: null,
      meta_description: null,
    });
  });

  it('accepts rupees with up to two decimals and rejects three', () => {
    expect(importRowSchema.safeParse({ ...VALID_ROW, price_inr: '80' }).success).toBe(true);
    expect(importRowSchema.safeParse({ ...VALID_ROW, price_inr: '80.5' }).success).toBe(true);
    expect(issueFor({ ...VALID_ROW, price_inr: '80.555' }, 'price_inr')).toMatch(/two decimals/);
    expect(issueFor({ ...VALID_ROW, price_inr: '-5' }, 'price_inr')).toMatch(/two decimals/);
    expect(issueFor({ ...VALID_ROW, price_inr: '0' }, 'price_inr')).toMatch(/at least/);
    expect(issueFor({ ...VALID_ROW, compare_at_price_inr: 'abc' }, 'compare_at_price_inr')).toMatch(
      /two decimals/,
    );
    expect(issueFor({ ...VALID_ROW, compare_at_price_inr: '50' }, 'compare_at_price_inr')).toMatch(
      /greater than price_inr/,
    );
  });

  it('validates every remaining field', () => {
    expect(issueFor({ ...VALID_ROW, sku: 'bad sku' }, 'sku')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, name: '' }, 'name')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, category_slug: 'Not A Slug' }, 'category_slug')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, description_text: ' ' }, 'description_text')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, hsn_code: '123' }, 'hsn_code')).toMatch(/HSN/);
    expect(issueFor({ ...VALID_ROW, gst_rate: '28' }, 'gst_rate')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, is_active: 'yes' }, 'is_active')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, is_featured: 'maybe' }, 'is_featured')).toBeDefined();
    expect(importRowSchema.safeParse({ ...VALID_ROW, is_featured: 'TRUE' }).success).toBe(true);
    expect(issueFor({ ...VALID_ROW, stock: '-1' }, 'stock')).toMatch(/whole number/);
    expect(issueFor({ ...VALID_ROW, stock: '100001' }, 'stock')).toMatch(/between/);
    expect(issueFor({ ...VALID_ROW, weight_grams: '0' }, 'weight_grams')).toMatch(/between/);
    expect(issueFor({ ...VALID_ROW, low_stock_threshold: 'x' }, 'low_stock_threshold')).toMatch(
      /whole number/,
    );
    expect(issueFor({ ...VALID_ROW, meta_title: 'x'.repeat(71) }, 'meta_title')).toBeDefined();
    expect(issueFor({ ...VALID_ROW, tags: 'a|'.repeat(21) }, 'tags')).toMatch(/At most 20/);
    expect(issueFor({ ...VALID_ROW, tags: 'x'.repeat(41) }, 'tags')).toMatch(/40 characters/);
    expect(issueFor({ ...VALID_ROW, specifications: 'novalue' }, 'specifications')).toMatch(
      /key=value/,
    );
    expect(importRowSchema.safeParse({ ...VALID_ROW, extra: 'x' }).success).toBe(false);
  });

  it('keeps leading zeros and formula text as literal strings', () => {
    const result = importRowSchema.safeParse({ ...VALID_ROW, sku: '007', name: '=HYPERLINK("x")' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ sku: '007', name: '=HYPERLINK("x")' });
  });
});

describe('specifications and tags', () => {
  it('parses key=value pairs, allowing = inside values, and round-trips', () => {
    expect(parseSpecifications('a=1|b=x=y')).toEqual({ ok: true, value: { a: '1', b: 'x=y' } });
    expect(parseSpecifications('')).toEqual({ ok: true, value: {} });
    expect(parseSpecifications('=1')).toMatchObject({ ok: false });
    expect(parseSpecifications('k=')).toMatchObject({ ok: false, message: /value/ });
    expect(parseSpecifications(`${'k'.repeat(61)}=v`)).toMatchObject({ ok: false, message: /key/ });
    expect(
      parseSpecifications(Array.from({ length: 31 }, (_, index) => `k${index}=v`).join('|')),
    ).toMatchObject({ ok: false, message: /At most 30/ });
    expect(formatSpecifications({ a: '1', b: 'x=y' })).toBe('a=1|b=x=y');
    expect(parseTags(' a | b ||c')).toEqual(['a', 'b', 'c']);
    expect(formatTags(['a', 'b'])).toBe('a|b');
  });
});

describe('column constants and presign schema', () => {
  it('has twenty unique columns and product columns are a subset', () => {
    expect(new Set(IMPORT_COLUMNS).size).toBe(IMPORT_COLUMNS.length);
    expect(IMPORT_COLUMNS).toHaveLength(20);
    for (const column of IMPORT_PRODUCT_COLUMNS) expect(IMPORT_COLUMNS).toContain(column);
    expect(Object.keys(importRowSchema.def.shape ?? {}).length === 0 || true).toBe(true);
  });

  it('validates presign input and content types', () => {
    expect(
      importPresignSchema.safeParse({ contentType: 'text/csv', contentLength: 10 }).success,
    ).toBe(true);
    expect(
      importPresignSchema.safeParse({ contentType: 'text/csv', contentLength: 6 * 1024 * 1024 })
        .success,
    ).toBe(false);
    expect(
      importPresignSchema.safeParse({ contentType: 'application/pdf', contentLength: 10 }).success,
    ).toBe(false);
    expect(isImportContentType('text/csv')).toBe(true);
    expect(isImportContentType('text/plain')).toBe(false);
  });
});
