import type { JobState, PresignedUpload } from './catalogue-types';

/** Response shapes from the P07 admin API (scratchpad/admin-api-contracts-p07-p08.md, "P07"). */

export type ImportStatus = 'UPLOADED' | 'VALIDATED' | 'APPLIED' | 'FAILED';

export interface ImportRowError {
  /** 1-based spreadsheet line (the header is line 1). */
  readonly line: number;
  readonly field: string;
  readonly message: string;
  /** The offending cell, truncated to 80 characters by the API. */
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

export interface ImportReport {
  readonly creates: readonly ImportProductChange[];
  readonly updates: readonly ImportProductChange[];
  readonly stockDeltas: readonly ImportStockDelta[];
  /** At most the first 200; the error CSV carries all of them. */
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
  /** Present after validation. */
  readonly report: ImportReport | null;
  /** Why the job FAILED (parse or apply failure); null otherwise. */
  readonly error: string | null;
  /** Whether `GET /admin/import/:jobId/errors` returns a link. */
  readonly hasErrorReport: boolean;
  readonly actor: { readonly id: string; readonly email: string };
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly appliedAt: string | null;
}

/** `POST /admin/import`: the UPLOADED job plus where to PUT the bytes. */
export interface ImportUploadResult {
  readonly job: ImportJobDto;
  readonly upload: PresignedUpload;
}

/** `POST …/validate` and `POST …/apply` answer with a queue job id, not the import id. */
export interface QueuedJob {
  readonly jobId: string;
}

export interface ErrorReportLink {
  readonly url: string;
  readonly expiresAt: string;
}

export type ExportType = 'products' | 'orders' | 'customers';

export interface ExportRequested {
  readonly exportId: string;
}

export interface ExportStatus {
  readonly id: string;
  readonly type: ExportType;
  readonly state: JobState;
  /** A 15-minute presigned GET once `state === 'completed'`. */
  readonly url: string | null;
  readonly expiresAt: string | null;
  readonly error: string | null;
}

export type TemplateFormat = 'csv' | 'xlsx';

/** Plain anchors go straight through the BFF; GET is proxied without a CSRF header. */
export const importTemplateHref = (format: TemplateFormat): string =>
  `/api/v1/admin/import/template?format=${format}`;

export const IMPORT_REPORT_ERRORS_MAX = 200;
