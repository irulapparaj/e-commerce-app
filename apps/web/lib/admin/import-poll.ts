import { adminApi } from './api';
import type { JobStatus } from './catalogue-types';
import type { ImportJobDto, QueuedJob } from './import-types';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export interface WaitForJobOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isSettled = (state: JobStatus['state']): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

/**
 * Polls `GET /admin/jobs/:id` until the queue job settles and returns it as-is. Unlike `pollJob`
 * (images) a failed job is a normal outcome here: a validate job completes even when the import
 * ends up FAILED, and an apply job fails when its transaction rolled back, so callers re-read the
 * import itself for the status and the reason.
 */
export const waitForJob = async (
  jobId: string,
  options: WaitForJobOptions = {},
): Promise<JobStatus> => {
  const {
    intervalMs = POLL_INTERVAL_MS,
    timeoutMs = POLL_TIMEOUT_MS,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    const { data } = await adminApi.get<JobStatus>(`/admin/jobs/${jobId}`);
    if (isSettled(data.state)) return data;
    if (now() >= deadline) throw new Error('The job is taking too long; refresh to check again');
    await sleep(intervalMs);
  }
};

export type ImportStep = 'validate' | 'apply';

/** `POST /admin/import/:id/validate|apply` → the queue job id to wait for (202). */
export const requestImportStep = async (importId: string, step: ImportStep): Promise<string> => {
  const { data } = await adminApi.post<QueuedJob>(`/admin/import/${importId}/${step}`);
  return data.jobId;
};

export const fetchImportJob = async (importId: string): Promise<ImportJobDto> => {
  const { data } = await adminApi.get<ImportJobDto>(`/admin/import/${importId}`);
  return data;
};

/** Waits for the queue job, then returns the import with its new status and report. */
export const settleImportStep = async (
  importId: string,
  queueJobId: string,
  options: WaitForJobOptions = {},
): Promise<ImportJobDto> => {
  await waitForJob(queueJobId, options);
  return fetchImportJob(importId);
};
