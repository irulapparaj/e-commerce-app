import { IMPORT_ERROR_VALUE_MAX } from '@pe/shared';
import type { ImportJob, ImportStatus } from '@prisma/client';

import { csvDocument } from '../exports/csv-safe';

export interface ImportRowError {
  readonly line: number;
  readonly field: string;
  readonly message: string;
  /** The offending cell, truncated so a report never carries a whole description. */
  readonly value: string;
}

export interface ImportProductChange {
  readonly sku: string;
  readonly name: string;
  readonly variants: number;
}

export interface ImportStockDelta {
  readonly variantSku: string;
  readonly current: number;
  readonly target: number;
  readonly delta: number;
}

export interface ImportSummary {
  readonly creates: number;
  readonly updates: number;
  readonly stockDeltas: number;
  readonly errors: number;
}

/** Stored on `ImportJob.report`; the arrays are bounded by the 5,000-row cap. */
export interface ImportReport {
  readonly creates: readonly ImportProductChange[];
  readonly updates: readonly ImportProductChange[];
  readonly stockDeltas: readonly ImportStockDelta[];
  /** First `REPORT_ERRORS_MAX` errors; the CSV under `errorReportKey` has all of them. */
  readonly errors: readonly ImportRowError[];
}

export interface ImportJobDto {
  readonly id: string;
  readonly status: ImportStatus;
  readonly fileKey: string;
  readonly contentType: string;
  readonly totalRows: number;
  readonly okRows: number;
  readonly errorRows: number;
  readonly summary: ImportSummary | null;
  readonly report: ImportReport | null;
  readonly error: string | null;
  readonly hasErrorReport: boolean;
  readonly actor: { readonly id: string; readonly email: string };
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly appliedAt: string | null;
}

export const REPORT_ERRORS_MAX = 200;
export const ERROR_CSV_HEADER = ['line', 'field', 'message', 'value'] as const;

export const truncateValue = (value: string): string =>
  value.length <= IMPORT_ERROR_VALUE_MAX ? value : `${value.slice(0, IMPORT_ERROR_VALUE_MAX - 1)}…`;

export const summarise = (report: ImportReport, totalErrors: number): ImportSummary => ({
  creates: report.creates.length,
  updates: report.updates.length,
  stockDeltas: report.stockDeltas.length,
  errors: totalErrors,
});

/** `line, field, message, value(truncated 80)` (P07 §5), guarded like every export. */
export const errorReportCsv = (errors: readonly ImportRowError[]): string =>
  csvDocument(
    ERROR_CSV_HEADER,
    errors.map((error) => [error.line, error.field, error.message, error.value]),
  );

export type ImportJobRow = ImportJob & {
  readonly actor: { readonly id: string; readonly email: string };
};

export const toImportJobDto = (row: ImportJobRow): ImportJobDto => {
  const report = row.report as ImportReport | null;
  return {
    id: row.id,
    status: row.status,
    fileKey: row.fileKey,
    contentType: row.contentType,
    totalRows: row.totalRows,
    okRows: row.okRows,
    errorRows: row.errorRows,
    summary: report === null ? null : summarise(report, row.errorRows === 0 ? 0 : row.errorRows),
    report,
    error: row.error,
    hasErrorReport: row.errorReportKey !== null,
    actor: row.actor,
    createdAt: row.createdAt.toISOString(),
    validatedAt: row.validatedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
};
