import { IMPORT_MAX_BYTES, type ImportContentType } from '@pe/shared';

import { adminApi } from './api';
import type { ImportJobDto, ImportUploadResult } from './import-types';
import { type FileLike, uploadWithProgress } from './upload';

const BYTES_PER_MB = 1024 * 1024;

export const CSV_TYPE: ImportContentType = 'text/csv';
export const XLSX_TYPE: ImportContentType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const IMPORT_TYPE_MESSAGE = 'Only .csv or .xlsx files can be imported';
export const IMPORT_SIZE_MESSAGE = `Files must be ${IMPORT_MAX_BYTES / BYTES_PER_MB} MB or smaller`;
export const IMPORT_EMPTY_MESSAGE = 'The file is empty';
/** Extensions first: browsers report `application/vnd.ms-excel` or nothing for CSV. */
export const IMPORT_ACCEPT = `.csv,.xlsx,${CSV_TYPE},${XLSX_TYPE}`;

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
};

/**
 * The canonical content type the API accepts, inferred from the extension because the browser's
 * `File.type` for spreadsheets is unreliable; null when the file is neither CSV nor XLSX.
 */
export const inferImportContentType = (file: FileLike): ImportContentType | null => {
  switch (extensionOf(file.name)) {
    case 'csv':
      return CSV_TYPE;
    case 'xlsx':
      return XLSX_TYPE;
    default:
      return file.type === CSV_TYPE || file.type === XLSX_TYPE ? file.type : null;
  }
};

export type ImportFileCheck =
  | { readonly ok: true; readonly contentType: ImportContentType }
  | { readonly ok: false; readonly error: string };

/** Mirrors the server's presign checks so an invalid file never costs a request. */
export const validateImportFile = (file: FileLike): ImportFileCheck => {
  const contentType = inferImportContentType(file);
  if (contentType === null) return { ok: false, error: IMPORT_TYPE_MESSAGE };
  if (file.size === 0) return { ok: false, error: IMPORT_EMPTY_MESSAGE };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_SIZE_MESSAGE };
  return { ok: true, contentType };
};

export interface UploadImportInput {
  readonly file: File;
  readonly onProgress?: (fraction: number) => void;
}

/** `POST /admin/import` (creates the UPLOADED job) then PUTs the bytes with exactly the returned headers. */
export const uploadImportFile = async ({
  file,
  onProgress,
}: UploadImportInput): Promise<ImportJobDto> => {
  const check = validateImportFile(file);
  if (!check.ok) throw new Error(check.error);
  const { data } = await adminApi.post<ImportUploadResult>('/admin/import', {
    contentType: check.contentType,
    contentLength: file.size,
  });
  await uploadWithProgress({
    url: data.upload.url,
    headers: data.upload.headers,
    file,
    ...(onProgress === undefined ? {} : { onProgress }),
  });
  return data.job;
};
