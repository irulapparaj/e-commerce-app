import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, isAllowedImageType } from '@pe/shared';

import { adminApi } from './api';
import type { JobStatus, PresignedUpload } from './catalogue-types';

const BYTES_PER_MB = 1024 * 1024;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;
const NETWORK_RETRIES = 1;

export const IMAGE_TYPE_MESSAGE = 'Only JPEG, PNG, WebP or AVIF images are allowed';
export const IMAGE_SIZE_MESSAGE = `Images must be ${IMAGE_MAX_BYTES / BYTES_PER_MB} MB or smaller`;
export const IMAGE_ACCEPT = IMAGE_CONTENT_TYPES.join(',');

export type UploadFailure = 'network' | 'status' | 'aborted';

export class UploadError extends Error {
  readonly kind: UploadFailure;
  readonly status: number | null;

  constructor(kind: UploadFailure, message: string, status: number | null = null) {
    super(message);
    this.name = 'UploadError';
    this.kind = kind;
    this.status = status;
  }
}

export interface FileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/** Mirrors the server's presign checks so an invalid file never costs a request. */
export const validateImageFile = (file: FileLike): string | null => {
  if (!isAllowedImageType(file.type)) return IMAGE_TYPE_MESSAGE;
  if (file.size > IMAGE_MAX_BYTES) return IMAGE_SIZE_MESSAGE;
  return null;
};

export interface UploadWithProgressInput {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly file: Blob;
  readonly onProgress?: (fraction: number) => void;
}

/** Raw PUT to the presigned URL; `XMLHttpRequest` because `fetch` has no upload progress. */
export const uploadWithProgress = ({
  url,
  headers,
  file,
  onProgress,
}: UploadWithProgressInput): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= HTTP_OK_MIN && xhr.status <= HTTP_OK_MAX) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new UploadError('status', `Upload rejected (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new UploadError('network', 'Upload failed; check your connection'));
    xhr.onabort = () => reject(new UploadError('aborted', 'Upload cancelled'));
    xhr.send(file);
  });

const isNetworkFailure = (error: unknown): boolean =>
  error instanceof UploadError && error.kind === 'network';

/** One retry on a network-level failure; HTTP rejections (expired URL, wrong type) are final. */
const uploadWithRetry = async (input: UploadWithProgressInput): Promise<void> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await uploadWithProgress(input);
      return;
    } catch (error) {
      if (attempt >= NETWORK_RETRIES || !isNetworkFailure(error)) throw error;
      input.onProgress?.(0);
    }
  }
};

export interface PresignAndUploadInput {
  readonly presignPath: string;
  readonly confirmPath: string;
  readonly file: File;
  readonly alt?: string;
  readonly onProgress?: (fraction: number) => void;
}

/** presign → PUT (with retry) → confirm; resolves with the processing job id (202). */
export const presignAndUpload = async ({
  presignPath,
  confirmPath,
  file,
  alt,
  onProgress,
}: PresignAndUploadInput): Promise<{ readonly jobId: string; readonly key: string }> => {
  const invalid = validateImageFile(file);
  if (invalid !== null) throw new UploadError('status', invalid);
  const { data: presigned } = await adminApi.post<PresignedUpload>(presignPath, {
    contentType: file.type,
    contentLength: file.size,
  });
  await uploadWithRetry({
    url: presigned.url,
    headers: presigned.headers,
    file,
    ...(onProgress === undefined ? {} : { onProgress }),
  });
  const { data } = await adminApi.post<{ jobId: string }>(confirmPath, {
    key: presigned.key,
    ...(alt === undefined ? {} : { alt }),
  });
  return { jobId: data.jobId, key: presigned.key };
};

export interface PollJobOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isSettled = (state: JobStatus['state']): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

/** Polls `GET /admin/jobs/:id` until it settles; rejects with the job error or on timeout. */
export const pollJob = async (jobId: string, options: PollJobOptions = {}): Promise<JobStatus> => {
  const {
    intervalMs = POLL_INTERVAL_MS,
    timeoutMs = POLL_TIMEOUT_MS,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    const { data } = await adminApi.get<JobStatus>(`/admin/jobs/${jobId}`);
    if (data.state === 'completed') return data;
    if (isSettled(data.state))
      throw new UploadError('status', data.error ?? 'Image processing failed');
    if (now() >= deadline) throw new UploadError('status', 'Image processing timed out');
    await sleep(intervalMs);
  }
};
