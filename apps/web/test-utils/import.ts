import type { ExportStatus, ImportJobDto, ImportReport } from '@/lib/admin/import-types';

/** Shared fixtures for the P07 component tests. */

export const IMPORT_ID = '66666666-6666-4666-8666-666666666601';
export const QUEUE_JOB_ID = 'queue-job-1';

export const cleanReport: ImportReport = {
  creates: [
    { sku: 'IMP-AG-001', name: 'Import Sandalwood Agarbatti', variants: 2 },
    { sku: 'IMP-AG-002', name: 'Import Rose Agarbatti', variants: 2 },
    { sku: 'IMP-DH-001', name: 'Import Dhoop Cones', variants: 1 },
  ],
  updates: [{ sku: 'ROSE', name: 'Rose Agarbatti', variants: 2 }],
  stockDeltas: [
    { variantSku: 'ROSE-50', current: 10, target: 40, delta: 30 },
    { variantSku: 'ROSE-100', current: 2, target: 0, delta: -2 },
  ],
  errors: [],
};

export const failedReport: ImportReport = {
  creates: [],
  updates: [],
  stockDeltas: [],
  errors: [
    { line: 3, field: 'name', message: 'must match line 2 for sku IMP-BAD-1', value: 'Bad Price' },
    { line: 4, field: 'category_slug', message: 'unknown category', value: 'no-such-category' },
    { line: 5, field: 'variant_sku', message: 'duplicate variant sku', value: 'IMP-BAD-1-A' },
    { line: 6, field: 'gst_rate', message: 'must be 5, 12 or 18', value: '28' },
  ],
};

export const uploadedJob: ImportJobDto = {
  id: IMPORT_ID,
  status: 'UPLOADED',
  fileKey: `imports/${IMPORT_ID}.csv`,
  contentType: 'text/csv',
  totalRows: 0,
  okRows: 0,
  errorRows: 0,
  summary: null,
  report: null,
  error: null,
  hasErrorReport: false,
  actor: { id: 'u1', email: 'admin@example.test' },
  createdAt: '2026-09-26T04:00:00.000Z',
  validatedAt: null,
  appliedAt: null,
};

export const validatedJob: ImportJobDto = {
  ...uploadedJob,
  status: 'VALIDATED',
  totalRows: 7,
  okRows: 7,
  errorRows: 0,
  summary: { creates: 3, updates: 1, stockDeltas: 2, errors: 0 },
  report: cleanReport,
  validatedAt: '2026-09-26T04:01:00.000Z',
};

export const failedJob: ImportJobDto = {
  ...uploadedJob,
  id: '66666666-6666-4666-8666-666666666602',
  status: 'FAILED',
  totalRows: 6,
  okRows: 2,
  errorRows: 4,
  summary: { creates: 0, updates: 0, stockDeltas: 0, errors: 4 },
  report: failedReport,
  hasErrorReport: true,
  validatedAt: '2026-09-26T04:01:00.000Z',
};

export const appliedJob: ImportJobDto = {
  ...validatedJob,
  status: 'APPLIED',
  appliedAt: '2026-09-26T04:05:00.000Z',
};

export const queueJob = (state: string, error: string | null = null) => ({
  id: QUEUE_JOB_ID,
  name: 'import-validate',
  state,
  error,
  output: null,
});

export const exportStatus = (overrides: Partial<ExportStatus> = {}): ExportStatus => ({
  id: 'export-1',
  type: 'products',
  state: 'active',
  url: null,
  expiresAt: null,
  error: null,
  ...overrides,
});
