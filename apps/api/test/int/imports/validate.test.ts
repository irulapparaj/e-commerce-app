import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { IMPORT_RATE_LIMIT } from '../../../src/modules/imports/routes';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import {
  CSV,
  getImport,
  importFixture,
  IMPORTS_BUCKET,
  uploadImport,
  validateNow,
  XLSX,
} from '../../helpers/imports';
import { listQueuedJobs, resetJobs, waitForJob } from '../../helpers/jobs';

const readAll = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
};

describe('import upload and validation', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;
  let categoryId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  it('serves CSV and XLSX templates whose header is the schema column list', async () => {
    const csv = await adminInject(testApp, staff.token, 'GET', '/admin/import/template');
    const xlsx = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/import/template?format=xlsx',
    );

    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('product-import-template.csv');
    expect(csv.body.replace('﻿', '').split('\r\n')[0]).toContain('"sku","name","category_slug"');
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(xlsx.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('presigns an upload only for ADMIN under the daily limit and records the job', async () => {
    const staffAttempt = await adminInject(testApp, staff.steppedToken, 'POST', '/admin/import', {
      contentType: CSV,
      contentLength: 10,
    });
    const tooBig = await adminInject(testApp, admin.token, 'POST', '/admin/import', {
      contentType: CSV,
      contentLength: 6 * 1024 * 1024,
    });
    const upload = await uploadImport(testApp, admin, importFixture('valid.csv'));
    const listed = await adminInject(testApp, staff.token, 'GET', '/admin/import');
    const audit = await getPrisma().auditLog.findFirst({ where: { action: 'import.uploaded' } });

    expect(staffAttempt.statusCode).toBe(403);
    expect(tooBig.statusCode).toBe(400);
    expect(upload.job).toMatchObject({ status: 'UPLOADED', contentType: CSV, totalRows: 0 });
    expect(upload.upload.key).toBe(`imports/${upload.job.id}.csv`);
    expect(upload.upload.headers['content-type']).toBe(CSV);
    expect(body<{ id: string }[]>(listed).data.map((job) => job.id)).toEqual([upload.job.id]);
    expect(audit?.entityId).toBe(upload.job.id);
    expect(IMPORT_RATE_LIMIT).toEqual({ limit: 10, windowSeconds: 86_400 });
  });

  it('validates a clean CSV to VALIDATED with counts, classification and stock deltas', async () => {
    const { job } = await uploadImport(testApp, admin, importFixture('valid.csv'));

    const result = await validateNow(testApp, job.id);
    const dto = await getImport(testApp, staff, job.id);
    const audit = await getPrisma().auditLog.findFirst({ where: { action: 'import.validated' } });

    expect(result).toMatchObject({ status: 'VALIDATED', totalRows: 5, okRows: 5, errorRows: 0 });
    expect(dto).toMatchObject({
      status: 'VALIDATED',
      hasErrorReport: false,
      summary: { creates: 3, updates: 0, stockDeltas: 4, errors: 0 },
    });
    expect(dto.report?.creates.map((change) => change.sku)).toEqual([
      'IMP-AG-001',
      'IMP-CM-002',
      'IMP-DH-003',
    ]);
    expect(dto.validatedAt).not.toBeNull();
    expect(audit?.after).toMatchObject({ status: 'VALIDATED', creates: 3, okRows: 5 });
  });

  it('validates the XLSX fixture the same way and classifies existing skus as updates', async () => {
    await createProduct(testApp, { name: 'Existing', categoryId, sku: 'IMP-CM-002', stock: 7 });
    const { job } = await uploadImport(testApp, admin, importFixture('valid.xlsx'), XLSX);

    const result = await validateNow(testApp, job.id);
    const dto = await getImport(testApp, admin, job.id);

    expect(result.status).toBe('VALIDATED');
    expect(dto.summary).toEqual({ creates: 2, updates: 1, stockDeltas: 4, errors: 0 });
    expect(dto.report?.updates).toEqual([
      { sku: 'IMP-CM-002', name: 'Import Pure Camphor', variants: 2 },
    ]);
  });

  it('marks bad rows FAILED with an error CSV that lists line numbers', async () => {
    const { job } = await uploadImport(testApp, admin, importFixture('bad-rows.csv'));

    const result = await validateNow(testApp, job.id);
    const dto = await getImport(testApp, staff, job.id);
    const link = await adminInject(testApp, staff.token, 'GET', `/admin/import/${job.id}/errors`);
    const report = await readAll(
      await testApp.ports.storage.getStream({
        bucket: IMPORTS_BUCKET,
        key: `imports/${job.id}-errors.csv`,
      }),
    );
    const apply = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/import/${job.id}/apply`,
    );

    expect(result).toMatchObject({ status: 'FAILED', totalRows: 6, okRows: 2, errorRows: 4 });
    expect(dto.hasErrorReport).toBe(true);
    expect(dto.report?.errors.map((error) => [error.line, error.field])).toEqual([
      [3, 'name'],
      [4, 'category_slug'],
      [5, 'variant_sku'],
      [6, 'gst_rate'],
      [6, 'is_active'],
      [6, 'stock'],
    ]);
    expect(link.statusCode).toBe(200);
    expect(body<{ url: string }>(link).data.url).toContain(`${job.id}-errors.csv`);
    expect(report.split('\r\n')[0]).toBe('﻿"line","field","message","value"');
    expect(report).toContain('"4","category_slug"');
    expect(apply.statusCode).toBe(409);
  });

  it('fails fast on too many rows, an unknown column and a mismatched content type', async () => {
    const tooMany = await uploadImport(testApp, admin, importFixture('too-many-rows.csv'));
    const unknown = await uploadImport(testApp, admin, importFixture('unknown-column.csv'));
    const mismatch = await uploadImport(testApp, admin, importFixture('valid.xlsx'), CSV);
    const macro = await uploadImport(testApp, admin, importFixture('macro.xlsx'), XLSX);

    const results = await Promise.all(
      [tooMany, unknown, mismatch, macro].map(({ job }) => validateNow(testApp, job.id)),
    );
    const failed = await getPrisma().auditLog.count({ where: { action: 'import.failed' } });

    expect(results.map((result) => result.status)).toEqual([
      'FAILED',
      'FAILED',
      'FAILED',
      'FAILED',
    ]);
    expect(results[0]?.error).toBe('The import file has too many rows');
    expect(results[1]?.error).toContain('price_usd');
    expect(results[2]?.error).toContain('not a UTF-8 CSV');
    expect(results[3]?.error).toContain('macros');
    expect(failed).toBe(4);
    expect((await getImport(testApp, admin, tooMany.job.id)).error).toContain('too many rows');
  });

  it('enqueues import-validate through the route and a worker completes it', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const { job } = await uploadImport(testApp, admin, importFixture('valid.csv'));
      const missing = await adminInject(
        testApp,
        admin.token,
        'POST',
        '/admin/import/00000000-0000-4000-8000-000000000000/validate',
      );

      const res = await adminInject(
        testApp,
        admin.token,
        'POST',
        `/admin/import/${job.id}/validate`,
      );
      const queued = await listQueuedJobs('import-validate');
      const done = await waitForJob(
        worker,
        'import-validate',
        body<{ jobId: string }>(res).data.jobId,
      );

      expect(missing.statusCode).toBe(404);
      expect(res.statusCode).toBe(202);
      expect(queued.map((row) => row.data)).toEqual([{ jobId: job.id }]);
      expect(done.state).toBe('completed');
      expect(done.output).toMatchObject({ status: 'VALIDATED', okRows: 5 });
    } finally {
      await worker.close();
    }
  });

  it('refuses to validate an upload that was never completed', async () => {
    const res = await adminInject(testApp, admin.token, 'POST', '/admin/import', {
      contentType: CSV,
      contentLength: 10,
    });
    const { job } = body<{ job: { id: string } }>(res).data;

    const validate = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/import/${job.id}/validate`,
    );

    expect(validate.statusCode).toBe(404);
  });
});
