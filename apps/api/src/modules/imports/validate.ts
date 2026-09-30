import { IMPORT_PRODUCT_COLUMNS, type ImportRow } from '@pe/shared';

import type { ParsedRow } from './parse';
import {
  type ImportProductChange,
  type ImportReport,
  type ImportRowError,
  type ImportStockDelta,
  REPORT_ERRORS_MAX,
  truncateValue,
} from './report';
import { parseImportRow } from './row.schema';

export interface ExistingProduct {
  readonly id: string;
  readonly name: string;
}

export interface ExistingVariant {
  readonly id: string;
  readonly productSku: string;
  readonly stock: number;
}

/** Everything the cross-row checks need from the database, loaded once per file. */
export interface ValidationContext {
  readonly categorySlugs: ReadonlySet<string>;
  readonly products: ReadonlyMap<string, ExistingProduct>;
  readonly variants: ReadonlyMap<string, ExistingVariant>;
}

export interface VariantEntry {
  readonly line: number;
  readonly row: ImportRow;
}

/** Rows sharing a product `sku`, in file order; the first row's product fields are canonical. */
export interface ProductGroup {
  readonly sku: string;
  readonly firstLine: number;
  readonly product: ImportRow;
  readonly variants: readonly VariantEntry[];
  readonly exists: boolean;
}

export interface ValidationOutcome {
  readonly totalRows: number;
  readonly okRows: number;
  readonly errorRows: number;
  readonly errors: readonly ImportRowError[];
  readonly report: ImportReport;
  /** Groups whose rows all validated; only meaningful for apply when `errors` is empty. */
  readonly groups: readonly ProductGroup[];
}

const cellValue = (row: ImportRow, field: string): string => {
  const value = (row as Record<string, unknown>)[field];
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const productFieldsMatch = (a: ImportRow, b: ImportRow, field: string): boolean =>
  cellValue(a, field) === cellValue(b, field);

interface Parsed {
  readonly line: number;
  readonly row: ImportRow;
}

const parseAll = (
  rows: readonly ParsedRow[],
): { parsed: readonly Parsed[]; errors: readonly ImportRowError[] } =>
  rows.reduce<{ parsed: readonly Parsed[]; errors: readonly ImportRowError[] }>(
    (acc, { cells, line }) => {
      const result = parseImportRow(cells, line);
      return result.ok
        ? { ...acc, parsed: [...acc.parsed, { line, row: result.row }] }
        : { ...acc, errors: [...acc.errors, ...result.errors] };
    },
    { parsed: [], errors: [] },
  );

const groupBySku = (parsed: readonly Parsed[]): readonly ProductGroup[] => {
  const groups = new Map<string, ProductGroup>();
  for (const { line, row } of parsed) {
    const existing = groups.get(row.sku);
    groups.set(
      row.sku,
      existing === undefined
        ? { sku: row.sku, firstLine: line, product: row, variants: [{ line, row }], exists: false }
        : { ...existing, variants: [...existing.variants, { line, row }] },
    );
  }
  return [...groups.values()];
};

const crossRowErrors = (
  groups: readonly ProductGroup[],
  ctx: ValidationContext,
): readonly ImportRowError[] => {
  const seenVariantSkus = new Map<string, number>();
  return groups.flatMap((group) => {
    const errors: ImportRowError[] = [];
    if (!ctx.categorySlugs.has(group.product.category_slug)) {
      errors.push({
        line: group.firstLine,
        field: 'category_slug',
        message: 'Unknown category; categories are never created by import',
        value: group.product.category_slug,
      });
    }
    for (const { line, row } of group.variants) {
      for (const field of IMPORT_PRODUCT_COLUMNS) {
        if (line !== group.firstLine && !productFieldsMatch(group.product, row, field)) {
          errors.push({
            line,
            field,
            message: `Differs from row ${group.firstLine} for sku ${group.sku}`,
            value: truncateValue(cellValue(row, field)),
          });
        }
      }
      const duplicateOf = seenVariantSkus.get(row.variant_sku);
      if (duplicateOf !== undefined) {
        errors.push({
          line,
          field: 'variant_sku',
          message: `Duplicate variant_sku (also on row ${duplicateOf})`,
          value: row.variant_sku,
        });
      } else {
        seenVariantSkus.set(row.variant_sku, line);
      }
      const owner = ctx.variants.get(row.variant_sku);
      if (owner !== undefined && owner.productSku !== group.sku) {
        errors.push({
          line,
          field: 'variant_sku',
          message: `Variant already belongs to product ${owner.productSku}`,
          value: row.variant_sku,
        });
      }
    }
    return errors;
  });
};

const change = (group: ProductGroup): ImportProductChange => ({
  sku: group.sku,
  name: group.product.name,
  variants: group.variants.length,
});

/** `stock` is the target; the ledger gets `target − current`, and equal stock is no movement. */
export const stockDelta = (
  variantSku: string,
  target: number,
  current: number,
): ImportStockDelta | null =>
  target === current ? null : { variantSku, current, target, delta: target - current };

const deltasFor = (groups: readonly ProductGroup[], ctx: ValidationContext): ImportStockDelta[] =>
  groups.flatMap((group) =>
    group.variants.flatMap(({ row }) => {
      const delta = stockDelta(
        row.variant_sku,
        row.stock,
        ctx.variants.get(row.variant_sku)?.stock ?? 0,
      );
      return delta === null ? [] : [delta];
    }),
  );

/** Schema-parse and group without database context; apply uses it on an already validated file. */
export const groupRows = (
  rows: readonly ParsedRow[],
): { readonly groups: readonly ProductGroup[]; readonly errors: readonly ImportRowError[] } => {
  const { parsed, errors } = parseAll(rows);
  return { groups: groupBySku(parsed), errors };
};

const byLineThenField = (a: ImportRowError, b: ImportRowError): number =>
  a.line - b.line || a.field.localeCompare(b.field);

/**
 * Pure dry-run (P07 task 5): per-row schema, cross-row consistency, create/update classification
 * and stock deltas. The job wraps this with database lookups and persistence.
 */
export const validateRows = (
  rows: readonly ParsedRow[],
  ctx: ValidationContext,
): ValidationOutcome => {
  const { parsed, errors: rowErrors } = parseAll(rows);
  const groups = groupBySku(parsed).map((group) => ({
    ...group,
    exists: ctx.products.has(group.sku),
  }));
  const errors = [...rowErrors, ...crossRowErrors(groups, ctx)].sort(byLineThenField);
  const errorLines = new Set(errors.map((error) => error.line));
  const cleanGroups = groups.filter((group) =>
    group.variants.every(({ line }) => !errorLines.has(line)),
  );
  const report: ImportReport = {
    creates: cleanGroups.filter((group) => !group.exists).map(change),
    updates: cleanGroups.filter((group) => group.exists).map(change),
    stockDeltas: deltasFor(cleanGroups, ctx),
    errors: errors.slice(0, REPORT_ERRORS_MAX),
  };
  return {
    totalRows: rows.length,
    okRows: rows.length - errorLines.size,
    errorRows: errorLines.size,
    errors,
    report,
    groups: cleanGroups,
  };
};
