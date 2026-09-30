import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, isAppError } from '@pe/shared';
import type { ImportStatus } from '@prisma/client';

import type { ImportValidatePayload } from '../../jobs/queue';
import { type AuditActor, recordAudit } from '../audit/record';

import { IMPORT_KEY_PREFIX, type ImportDeps, readObject, sha256 } from './deps';
import { type ParsedFile, parseImportFile } from './parse';
import { errorReportCsv, type ImportReport } from './report';
import { type ValidationContext, validateRows } from './validate';

export interface ImportValidateResult {
  readonly jobId: string;
  readonly status: ImportStatus;
  readonly totalRows: number;
  readonly okRows: number;
  readonly errorRows: number;
  readonly error: string | null;
}

export const errorReportKeyFor = (jobId: string): string =>
  `${IMPORT_KEY_PREFIX}${jobId}-errors.csv`;

const RE_VALIDATABLE: readonly ImportStatus[] = ['UPLOADED', 'VALIDATED', 'FAILED'];

export const loadImportJob = async (deps: Pick<ImportDeps, 'prisma'>, jobId: string) => {
  const job = await deps.prisma.importJob.findUnique({ where: { id: jobId } });
  if (job === null) throw new Error(`import job ${jobId} not found`);
  return job;
};

const actorOf = (actorId: string): AuditActor => ({ actorId, ip: null, userAgent: null });

/** Everything the cross-row checks need, fetched in three queries regardless of file size. */
const loadContext = async (
  deps: Pick<ImportDeps, 'prisma'>,
  parsed: ParsedFile,
): Promise<ValidationContext> => {
  const skus = [...new Set(parsed.rows.map((row) => row.cells.sku.trim()))];
  const variantSkus = [...new Set(parsed.rows.map((row) => row.cells.variant_sku.trim()))];
  const [categories, products, variants] = await Promise.all([
    deps.prisma.category.findMany({ select: { slug: true } }),
    deps.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, name: true },
    }),
    deps.prisma.productVariant.findMany({
      where: { sku: { in: variantSkus } },
      select: { id: true, sku: true, stock: true, product: { select: { sku: true } } },
    }),
  ]);
  return {
    categorySlugs: new Set(categories.map((category) => category.slug)),
    products: new Map(products.map((product) => [product.sku, product])),
    variants: new Map(
      variants.map((variant) => [
        variant.sku,
        { id: variant.id, productSku: variant.product.sku, stock: variant.stock },
      ]),
    ),
  };
};

/** Records a failure that happened before or outside row validation (parse, size, apply). */
export const markImportFailed = async (
  deps: Pick<ImportDeps, 'prisma' | 'now'>,
  jobId: string,
  message: string,
  actor: AuditActor,
  action: 'import.failed' = 'import.failed',
): Promise<void> => {
  await deps.prisma.$transaction(async (tx) => {
    await tx.importJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: message, validatedAt: deps.now() },
    });
    await recordAudit(tx, {
      ...actor,
      action,
      entityType: 'import_job',
      entityId: jobId,
      after: { error: message },
    });
  });
};

/**
 * `import-validate` job (P07 task 5): parse as text → per-row and cross-row checks → report on the
 * job, error CSV in the bucket, status VALIDATED (clean) or FAILED (any error; a corrected file is
 * uploaded as a new job — partial applies are not allowed).
 */
export const runImportValidate = async (
  deps: ImportDeps,
  payload: ImportValidatePayload,
): Promise<ImportValidateResult> => {
  const job = await loadImportJob(deps, payload.jobId);
  const actor = actorOf(job.actorId);
  if (!RE_VALIDATABLE.includes(job.status))
    throw new Error(`import job ${job.id} cannot be validated from ${job.status}`);
  let bytes: Buffer;
  let parsed: ParsedFile;
  try {
    bytes = await readObject(deps, job.fileKey, IMPORT_MAX_BYTES);
    parsed = await parseImportFile(bytes, job.contentType, { maxRows: IMPORT_MAX_ROWS });
  } catch (error) {
    const message = isAppError(error) ? error.message : 'Could not read the file';
    await markImportFailed(deps, job.id, message, actor);
    deps.log.warn({ jobId: job.id, err: error }, 'import validation failed to parse');
    return {
      jobId: job.id,
      status: 'FAILED',
      totalRows: 0,
      okRows: 0,
      errorRows: 0,
      error: message,
    };
  }
  const outcome = validateRows(parsed.rows, await loadContext(deps, parsed));
  const status: ImportStatus = outcome.errorRows === 0 ? 'VALIDATED' : 'FAILED';
  const errorReportKey = outcome.errors.length === 0 ? null : errorReportKeyFor(job.id);
  if (errorReportKey !== null) {
    await deps.storage.put({
      bucket: deps.bucket,
      key: errorReportKey,
      body: errorReportCsv(outcome.errors),
      contentType: 'text/csv; charset=utf-8',
    });
  }
  const report: ImportReport = outcome.report;
  await deps.prisma.$transaction(async (tx) => {
    await tx.importJob.update({
      where: { id: job.id },
      data: {
        status,
        totalRows: outcome.totalRows,
        okRows: outcome.okRows,
        errorRows: outcome.errorRows,
        report: JSON.parse(JSON.stringify(report)) as object,
        fileHash: sha256(bytes),
        errorReportKey,
        error: null,
        validatedAt: deps.now(),
      },
    });
    await recordAudit(tx, {
      ...actor,
      action: 'import.validated',
      entityType: 'import_job',
      entityId: job.id,
      after: {
        status,
        totalRows: outcome.totalRows,
        okRows: outcome.okRows,
        errorRows: outcome.errorRows,
        creates: report.creates.length,
        updates: report.updates.length,
        stockDeltas: report.stockDeltas.length,
      },
    });
  });
  deps.log.info({ jobId: job.id, status, errorRows: outcome.errorRows }, 'import validated');
  return {
    jobId: job.id,
    status,
    totalRows: outcome.totalRows,
    okRows: outcome.okRows,
    errorRows: outcome.errorRows,
    error: null,
  };
};
