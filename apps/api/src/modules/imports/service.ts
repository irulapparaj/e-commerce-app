import { randomUUID } from 'node:crypto';

import {
  AppError,
  IMPORT_MAX_BYTES,
  type ImportContentType,
  type ImportPresignInput,
} from '@pe/shared';

import type { PresignedUpload } from '../../ports/object-storage';
import { type AuditActor, recordAudit } from '../audit/record';

import { IMPORT_KEY_PREFIX, type ImportDeps, readObject, sha256 } from './deps';
import { IMPORT_FORMAT_BY_TYPE } from './parse';
import { type ImportJobDto, toImportJobDto } from './report';

export const IMPORT_PRESIGN_TTL_SECONDS = 300;
export const ERROR_REPORT_TTL_SECONDS = 900;
const ACTOR_SELECT = { actor: { select: { id: true, email: true } } } as const;

export interface ImportUpload {
  readonly job: ImportJobDto;
  readonly upload: Omit<PresignedUpload, 'method'> & {
    readonly key: string;
    readonly expiresAt: string;
  };
}

export interface ImportService {
  createUpload(input: ImportPresignInput, actor: AuditActor): Promise<ImportUpload>;
  requestValidate(jobId: string, actor: AuditActor): Promise<{ jobId: string }>;
  /** Refuses unless the job is VALIDATED with zero errors and the object still matches its hash. */
  requestApply(jobId: string, actor: AuditActor): Promise<{ jobId: string }>;
  list(page: number, limit: number): Promise<{ rows: readonly ImportJobDto[]; total: number }>;
  get(jobId: string): Promise<ImportJobDto>;
  errorReportUrl(jobId: string): Promise<{ url: string; expiresAt: string }>;
}

const extensionFor = (contentType: ImportContentType): string =>
  IMPORT_FORMAT_BY_TYPE[contentType] ?? 'csv';

export const createImportService = (deps: ImportDeps): ImportService => {
  const load = async (jobId: string) => {
    const job = await deps.prisma.importJob.findUnique({
      where: { id: jobId },
      include: ACTOR_SELECT,
    });
    if (job === null) throw new AppError('NOT_FOUND', 'Import not found');
    return job;
  };

  const enqueue = async <N extends 'import-validate' | 'import-apply'>(
    name: N,
    data: Parameters<ImportDeps['jobs']['send']>[1] & { jobId: string },
  ): Promise<{ jobId: string }> => {
    const queued = await deps.jobs.send(name, data as never);
    if (queued === null) throw new AppError('INTERNAL', `Could not enqueue ${name}`);
    return { jobId: queued };
  };

  const createUpload: ImportService['createUpload'] = async (input, actor) => {
    if (actor.actorId === null) throw new AppError('UNAUTHENTICATED');
    const id = randomUUID();
    const key = `${IMPORT_KEY_PREFIX}${id}.${extensionFor(input.contentType)}`;
    const upload = await deps.storage.presignPut({
      bucket: deps.bucket,
      key,
      contentType: input.contentType,
      sizeBytes: input.contentLength,
      maxBytes: IMPORT_MAX_BYTES,
      expiresSec: IMPORT_PRESIGN_TTL_SECONDS,
    });
    const job = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.importJob.create({
        data: { id, actorId: actor.actorId ?? '', fileKey: key, contentType: input.contentType },
        include: ACTOR_SELECT,
      });
      await recordAudit(tx, {
        ...actor,
        action: 'import.uploaded',
        entityType: 'import_job',
        entityId: id,
        after: { fileKey: key, contentType: input.contentType, contentLength: input.contentLength },
      });
      return row;
    });
    const expiresAt = new Date(
      deps.now().getTime() + IMPORT_PRESIGN_TTL_SECONDS * 1000,
    ).toISOString();
    return {
      job: toImportJobDto(job),
      upload: { url: upload.url, headers: upload.headers, key, expiresAt },
    };
  };

  const requestValidate: ImportService['requestValidate'] = async (jobId) => {
    const job = await load(jobId);
    if (job.status === 'APPLIED')
      throw new AppError('CONFLICT', 'An applied import cannot be validated again');
    const head = await deps.storage.head({ bucket: deps.bucket, key: job.fileKey });
    if (!head.exists) throw new AppError('NOT_FOUND', 'Upload not found; complete the PUT first');
    return enqueue('import-validate', { jobId: job.id });
  };

  const requestApply: ImportService['requestApply'] = async (jobId, actor) => {
    if (actor.actorId === null) throw new AppError('UNAUTHENTICATED');
    const job = await load(jobId);
    if (job.status !== 'VALIDATED' || job.errorRows > 0) {
      throw new AppError(
        'CONFLICT',
        'Only a validated import with no errors can be applied; upload a corrected file',
      );
    }
    const bytes = await readObject(deps, job.fileKey, IMPORT_MAX_BYTES);
    if (sha256(bytes) !== job.fileHash)
      throw new AppError('CONFLICT', 'File changed since validation; validate it again');
    return enqueue('import-apply', {
      jobId: job.id,
      actorId: actor.actorId,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  };

  const list: ImportService['list'] = async (page, limit) => {
    const [rows, total] = await Promise.all([
      deps.prisma.importJob.findMany({
        include: ACTOR_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      deps.prisma.importJob.count(),
    ]);
    return { rows: rows.map(toImportJobDto), total };
  };

  const errorReportUrl: ImportService['errorReportUrl'] = async (jobId) => {
    const job = await load(jobId);
    if (job.errorReportKey === null)
      throw new AppError('NOT_FOUND', 'This import has no error report');
    const { url } = await deps.storage.presignGet({
      bucket: deps.bucket,
      key: job.errorReportKey,
      expiresSec: ERROR_REPORT_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(deps.now().getTime() + ERROR_REPORT_TTL_SECONDS * 1000).toISOString(),
    };
  };

  return {
    createUpload,
    requestValidate,
    requestApply,
    list,
    get: async (jobId) => toImportJobDto(await load(jobId)),
    errorReportUrl,
  };
};
