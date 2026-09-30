import { z } from 'zod';

import { GST_RATES } from '../constants';
import { rupeesToPaise } from '../money';

import { HSN_PATTERN, skuSchema } from './catalogue';
import { SLUG_PATTERN } from './common';

/**
 * Spreadsheet import/export row (P07 task 1). Every input is a string: cells are never typed by
 * the parser, so `"007"` stays `"007"` and `=1+1` stays literal text. The column order here is the
 * template order, the export order and the only header the parser accepts.
 */
export const IMPORT_COLUMNS = [
  'sku',
  'name',
  'category_slug',
  'description_text',
  'how_to_use',
  'specifications',
  'hsn_code',
  'gst_rate',
  'tags',
  'is_active',
  'is_featured',
  'variant_sku',
  'variant_label',
  'price_inr',
  'compare_at_price_inr',
  'stock',
  'weight_grams',
  'low_stock_threshold',
  'meta_title',
  'meta_description',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns that describe the product; they must be identical on every row sharing a `sku`. */
export const IMPORT_PRODUCT_COLUMNS = [
  'sku',
  'name',
  'category_slug',
  'description_text',
  'how_to_use',
  'specifications',
  'hsn_code',
  'gst_rate',
  'tags',
  'is_active',
  'is_featured',
  'meta_title',
  'meta_description',
] as const satisfies readonly ImportColumn[];

export const IMPORT_CONTENT_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type ImportContentType = (typeof IMPORT_CONTENT_TYPES)[number];
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;
export const IMPORT_ERROR_VALUE_MAX = 80;
export const IMPORT_DEFAULT_LOW_STOCK_THRESHOLD = 10;

const NAME_MAX = 160;
const LABEL_MAX = 60;
/** Plain-text projection of a rich description; generous so exports round-trip. */
const DESCRIPTION_MAX = 20_000;
const HOW_TO_USE_MAX = 2_000;
const SPEC_KEY_MAX = 60;
const SPEC_VALUE_MAX = 200;
const SPEC_ENTRIES_MAX = 30;
const TAG_MAX = 40;
const TAGS_MAX = 20;
const META_TITLE_MAX = 70;
const META_DESCRIPTION_MAX = 160;
const STOCK_MAX = 100_000;
const WEIGHT_MAX_GRAMS = 100_000;
const RUPEES_PATTERN = /^\d{1,7}(?:\.\d{1,2})?$/;
const INTEGER_PATTERN = /^\d{1,6}$/;
const LIST_SEPARATOR = '|';
const SPEC_SEPARATOR = '=';

export const importPresignSchema = z.strictObject({
  contentType: z.enum(IMPORT_CONTENT_TYPES),
  contentLength: z.number().int().min(1).max(IMPORT_MAX_BYTES),
});

export type ImportPresignInput = z.infer<typeof importPresignSchema>;

/** `key=value|key=value`; the first `=` splits, so values may contain `=`. Empty → `{}`. */
export const parseSpecifications = (
  raw: string,
): { ok: true; value: Record<string, string> } | { ok: false; message: string } => {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: {} };
  const entries: [string, string][] = [];
  for (const part of trimmed.split(LIST_SEPARATOR)) {
    const index = part.indexOf(SPEC_SEPARATOR);
    if (index <= 0) return { ok: false, message: `Specification "${part.trim()}" needs key=value` };
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === '' || key.length > SPEC_KEY_MAX)
      return { ok: false, message: `Specification key must be 1–${SPEC_KEY_MAX} characters` };
    if (value === '' || value.length > SPEC_VALUE_MAX)
      return { ok: false, message: `Specification value must be 1–${SPEC_VALUE_MAX} characters` };
    entries.push([key, value]);
  }
  if (entries.length > SPEC_ENTRIES_MAX)
    return { ok: false, message: `At most ${SPEC_ENTRIES_MAX} specifications` };
  return { ok: true, value: Object.fromEntries(entries) };
};

export const formatSpecifications = (value: Readonly<Record<string, string>>): string =>
  Object.entries(value)
    .map(([key, item]) => `${key}${SPEC_SEPARATOR}${item}`)
    .join(LIST_SEPARATOR);

export const parseTags = (raw: string): readonly string[] =>
  raw
    .split(LIST_SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');

export const formatTags = (tags: readonly string[]): string => tags.join(LIST_SEPARATOR);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

const booleanCell = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false']))
  .transform((value) => value === 'true');

const optionalBooleanCell = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false', '']))
  .transform((value) => value === 'true');

const rupeesCell = z
  .string()
  .trim()
  .regex(RUPEES_PATTERN, 'Amount must be rupees with at most two decimals, e.g. 80 or 80.50')
  .transform((value) => rupeesToPaise(value) as number)
  .refine((paise) => paise >= 1, 'Amount must be at least ₹0.01');

const integerCell = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(INTEGER_PATTERN, 'Must be a whole number')
    .transform(Number)
    .refine((value) => value >= min && value <= max, `Must be between ${min} and ${max}`);

const specificationsCell = z.string().transform((value, ctx) => {
  const parsed = parseSpecifications(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: 'custom', message: parsed.message });
  return z.NEVER;
});

const tagsCell = z
  .string()
  .transform(parseTags)
  .refine((tags) => tags.length <= TAGS_MAX, `At most ${TAGS_MAX} tags`)
  .refine(
    (tags) => tags.every((tag) => tag.length <= TAG_MAX),
    `Each tag must be at most ${TAG_MAX} characters`,
  );

export const importRowSchema = z
  .strictObject({
    sku: skuSchema,
    name: z.string().trim().min(1).max(NAME_MAX),
    category_slug: z.string().trim().regex(SLUG_PATTERN, 'Must be a category slug'),
    description_text: z.string().trim().min(1).max(DESCRIPTION_MAX),
    how_to_use: optionalText(HOW_TO_USE_MAX),
    specifications: specificationsCell,
    hsn_code: z.string().trim().regex(HSN_PATTERN, 'HSN code must be 4, 6 or 8 digits'),
    gst_rate: z
      .string()
      .trim()
      .pipe(z.enum(GST_RATES.map(String) as [string, ...string[]]))
      .transform(Number),
    tags: tagsCell,
    is_active: booleanCell,
    is_featured: optionalBooleanCell,
    variant_sku: skuSchema,
    variant_label: z.string().trim().min(1).max(LABEL_MAX),
    price_inr: rupeesCell,
    compare_at_price_inr: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return null;
        const parsed = rupeesCell.safeParse(value);
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Invalid' });
        return z.NEVER;
      }),
    stock: integerCell(0, STOCK_MAX),
    weight_grams: integerCell(1, WEIGHT_MAX_GRAMS),
    low_stock_threshold: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return IMPORT_DEFAULT_LOW_STOCK_THRESHOLD;
        const parsed = integerCell(0, STOCK_MAX).safeParse(value);
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Invalid' });
        return z.NEVER;
      }),
    meta_title: optionalText(META_TITLE_MAX),
    meta_description: optionalText(META_DESCRIPTION_MAX),
  })
  .refine((row) => row.compare_at_price_inr === null || row.compare_at_price_inr > row.price_inr, {
    message: 'compare_at_price_inr must be greater than price_inr',
    path: ['compare_at_price_inr'],
  });

export type ImportRow = z.infer<typeof importRowSchema>;
/** The string cells as read from the sheet, keyed by column. */
export type ImportRawRow = Readonly<Record<ImportColumn, string>>;

export const isImportContentType = (value: string): value is ImportContentType =>
  (IMPORT_CONTENT_TYPES as readonly string[]).includes(value);
