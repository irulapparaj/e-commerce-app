import { type ImportRawRow, type ImportRow, importRowSchema } from '@pe/shared';

import { type ImportRowError, truncateValue } from './report';

export type { ImportRawRow, ImportRow } from '@pe/shared';
export { IMPORT_COLUMNS, IMPORT_PRODUCT_COLUMNS, importRowSchema } from '@pe/shared';

export type RowParse =
  | { readonly ok: true; readonly row: ImportRow }
  | { readonly ok: false; readonly errors: readonly ImportRowError[] };

/** One row through the shared Zod schema; every issue becomes a line/field/message/value tuple. */
export const parseImportRow = (cells: ImportRawRow, line: number): RowParse => {
  const result = importRowSchema.safeParse(cells);
  if (result.success) return { ok: true, row: result.data };
  const seen = new Set<string>();
  const errors = result.error.issues.flatMap((issue): ImportRowError[] => {
    const field = String(issue.path[0] ?? '');
    if (seen.has(field)) return [];
    seen.add(field);
    const raw = (cells as Record<string, string | undefined>)[field] ?? '';
    return [{ line, field, message: issue.message, value: truncateValue(raw) }];
  });
  return { ok: false, errors };
};
