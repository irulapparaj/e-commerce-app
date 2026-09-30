import { afterEach, describe, expect, it, vi } from 'vitest';

import { okEnvelope, stubFetch } from '@/test-utils/admin';
import { uploadedJob } from '@/test-utils/import';
import { FakeXhr, flushAsync, installFakeXhr } from '@/test-utils/xhr';

import {
  CSV_TYPE,
  IMPORT_EMPTY_MESSAGE,
  IMPORT_SIZE_MESSAGE,
  IMPORT_TYPE_MESSAGE,
  inferImportContentType,
  uploadImportFile,
  validateImportFile,
  XLSX_TYPE,
} from './import-upload';

const MB = 1024 * 1024;
const csv = (name = 'products.csv', size = 12, type = '') =>
  new File([new Uint8Array(size)], name, { type });
const presigned = {
  job: uploadedJob,
  upload: {
    url: 'https://bucket.test/imports/job.csv?sig=1',
    key: 'imports/job.csv',
    headers: { 'content-type': 'text/csv', 'content-length': '12' },
    expiresAt: '2026-09-26T00:05:00.000Z',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inferImportContentType', () => {
  it('trusts the extension over what the browser reports', () => {
    expect(inferImportContentType({ name: 'a.csv', type: '', size: 1 })).toBe(CSV_TYPE);
    expect(
      inferImportContentType({ name: 'A.CSV', type: 'application/vnd.ms-excel', size: 1 }),
    ).toBe(CSV_TYPE);
    expect(inferImportContentType({ name: 'sheet.xlsx', type: '', size: 1 })).toBe(XLSX_TYPE);
  });

  it('falls back to a canonical MIME type when the extension is unknown, else null', () => {
    expect(inferImportContentType({ name: 'export', type: CSV_TYPE, size: 1 })).toBe(CSV_TYPE);
    expect(inferImportContentType({ name: 'a.txt', type: 'text/plain', size: 1 })).toBeNull();
    expect(
      inferImportContentType({ name: 'a.xls', type: 'application/vnd.ms-excel', size: 1 }),
    ).toBeNull();
  });
});

describe('validateImportFile', () => {
  it('mirrors the server checks: type, empty, 5 MB cap', () => {
    expect(validateImportFile(csv('a.pdf'))).toEqual({ ok: false, error: IMPORT_TYPE_MESSAGE });
    expect(validateImportFile(csv('a.csv', 0))).toEqual({ ok: false, error: IMPORT_EMPTY_MESSAGE });
    expect(validateImportFile({ name: 'a.csv', type: '', size: 5 * MB + 1 })).toEqual({
      ok: false,
      error: IMPORT_SIZE_MESSAGE,
    });
    expect(validateImportFile({ name: 'a.csv', type: '', size: 5 * MB })).toEqual({
      ok: true,
      contentType: CSV_TYPE,
    });
  });
});

describe('uploadImportFile', () => {
  it('presigns with the canonical type, PUTs with exactly the returned headers and resolves the job', async () => {
    installFakeXhr();
    const calls = stubFetch(() => okEnvelope(presigned));
    const onProgress = vi.fn();
    const file = csv('products.csv', 12, 'application/vnd.ms-excel');

    const pending = uploadImportFile({ file, onProgress });
    await flushAsync();
    const xhr = FakeXhr.instances[0]!;
    xhr.progress(6, 12);
    xhr.respond(200);

    await expect(pending).resolves.toEqual(uploadedJob);
    expect(calls).toEqual([
      {
        url: '/api/v1/admin/import',
        method: 'POST',
        body: { contentType: CSV_TYPE, contentLength: 12 },
      },
    ]);
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe(presigned.upload.url);
    expect(xhr.headers).toEqual(presigned.upload.headers);
    expect(xhr.body).toBe(file);
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('rejects an invalid file before any request and surfaces a bucket rejection', async () => {
    installFakeXhr();
    const calls = stubFetch(() => okEnvelope(presigned));

    await expect(uploadImportFile({ file: csv('a.txt') })).rejects.toThrow(IMPORT_TYPE_MESSAGE);
    expect(calls).toHaveLength(0);

    const pending = uploadImportFile({ file: csv() });
    await flushAsync();
    FakeXhr.instances[0]!.respond(403);
    await expect(pending).rejects.toMatchObject({ kind: 'status', status: 403 });
  });
});
