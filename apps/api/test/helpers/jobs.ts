import type { JobName, JobStatus } from '../../src/jobs/queue';

import type { TestApp } from './app';
import { getPrismaRaw } from './db';

export interface QueuedJob {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly data: unknown;
}

const POLL_MS = 100;

/** Reads pg-boss's own table so tests assert on what was really enqueued (P04 §6). */
export const listQueuedJobs = async (name: JobName): Promise<readonly QueuedJob[]> =>
  getPrismaRaw().$queryRawUnsafe<QueuedJob[]>(
    'SELECT id::text AS id, name, state::text AS state, data FROM pgboss.job WHERE name = $1 ORDER BY created_on ASC',
    name,
  );

export const revalidateTagsEnqueued = async (): Promise<readonly (readonly string[])[]> =>
  (await listQueuedJobs('revalidate')).map((job) => (job.data as { tags: string[] }).tags);

/** Clears every job so per-test queue assertions start from zero; `resetDb()` leaves `pgboss` alone. */
export const resetJobs = async (): Promise<void> => {
  const raw = getPrismaRaw();
  const [schema] = await raw.$queryRawUnsafe<{ exists: boolean }[]>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job') AS exists",
  );
  if (schema?.exists === true) await raw.$executeRawUnsafe('DELETE FROM pgboss.job');
};

export const waitForJob = async (
  testApp: TestApp,
  name: JobName,
  id: string,
  timeoutMs = 15_000,
): Promise<JobStatus> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await testApp.app.jobs.getJob(name, id);
    if (
      job !== null &&
      (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled')
    )
      return job;
    if (Date.now() > deadline)
      throw new Error(`job ${name}/${id} did not finish (state ${job?.state ?? 'missing'})`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
};
