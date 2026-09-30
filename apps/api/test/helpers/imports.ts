import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ImportContentType } from '@pe/shared';

import { runImportApply } from '../../src/modules/imports/apply.job';
import { importDeps } from '../../src/modules/imports/deps';
import type { ImportJobDto } from '../../src/modules/imports/report';
import type { ImportUpload } from '../../src/modules/imports/service';
import { runImportValidate } from '../../src/modules/imports/validate.job';

import { adminInject, type AdminSession, body } from './admin';
import type { TestApp } from './app';

export const IMPORT_FIXTURES = resolve(import.meta.dirname, '../../../../tests/fixtures/imports');
export const CSV: ImportContentType = 'text/csv';
export const XLSX: ImportContentType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const IMPORTS_BUCKET = 'imports';

export const importFixture = (name: string): Buffer => readFileSync(resolve(IMPORT_FIXTURES, name));

/** Presigns through the real route, PUTs the bytes to MinIO and returns the created job. */
export const uploadImport = async (
  testApp: TestApp,
  session: AdminSession,
  bytes: Buffer,
  contentType: ImportContentType = CSV,
): Promise<ImportUpload> => {
  const res = await adminInject(testApp, session.token, 'POST', '/admin/import', {
    contentType,
    contentLength: bytes.length,
  });
  if (res.statusCode !== 201) throw new Error(`import presign failed: ${res.body}`);
  const upload = body<ImportUpload>(res).data;
  const put = await fetch(upload.upload.url, {
    method: 'PUT',
    headers: upload.upload.headers,
    body: bytes,
  });
  if (put.status !== 200) throw new Error(`import PUT failed: ${put.status}`);
  return upload;
};

/** Runs the validate job handler in-process (no worker) for deterministic assertions. */
export const validateNow = (testApp: TestApp, jobId: string) =>
  runImportValidate(importDeps(testApp.app), { jobId });

export const applyNow = (testApp: TestApp, jobId: string, session: AdminSession) =>
  runImportApply(importDeps(testApp.app), {
    jobId,
    actorId: session.userId,
    ip: '127.0.0.1',
    userAgent: 'vitest',
  });

export const getImport = async (
  testApp: TestApp,
  session: AdminSession,
  jobId: string,
): Promise<ImportJobDto> =>
  body<ImportJobDto>(await adminInject(testApp, session.token, 'GET', `/admin/import/${jobId}`))
    .data;
