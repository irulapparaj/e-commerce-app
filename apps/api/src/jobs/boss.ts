import { PgBoss } from 'pg-boss';

import {
  JOB_NAMES,
  type JobHandler,
  type JobName,
  type JobPayloads,
  type JobQueue,
  type JobState,
  type JobStatus,
  type SendOptions,
} from './queue';

export const PGBOSS_SCHEMA = 'pgboss';
const STOP_TIMEOUT_MS = 5_000;
const JOB_EXPIRE_SECONDS = 300;
const COMPLETED_RETENTION_SECONDS = 7 * 24 * 3600;

/**
 * Retries are deliberately off for media-process and revalidate: media rejections must surface
 * immediately to the uploader and the revalidate handler owns its own 1 s / 5 s / 30 s retry
 * ladder (P04 task 10). email.send and order.release get their own retry budgets below.
 */
const QUEUE_OPTIONS = {
  retryLimit: 0,
  expireInSeconds: JOB_EXPIRE_SECONDS,
  retentionSeconds: COMPLETED_RETENTION_SECONDS,
} as const;

/** Per-queue overrides. Queues not listed here use QUEUE_OPTIONS. */
const QUEUE_OPTIONS_OVERRIDES: Partial<Record<JobName, object>> = {
  'email.send': { ...QUEUE_OPTIONS, retryLimit: 3, retryDelay: 60 },
  // H-31: add retryDelay to prevent tight retry loop on order releases
  'order.release': { ...QUEUE_OPTIONS, retryLimit: 5, retryDelay: 60 },
  // H-31: shipping.status.notify was using default retryLimit:0 (no retries on delivery failure)
  'shipping.status.notify': { ...QUEUE_OPTIONS, retryLimit: 3, retryDelay: 60 },
  // H-06: import jobs use batched transactions; allow one retry with backoff so a transient
  // DB hiccup doesn't permanently fail a large import that already committed some batches.
  'import-apply': { ...QUEUE_OPTIONS, retryLimit: 1, retryDelay: 120 },
  'import-validate': { ...QUEUE_OPTIONS, retryLimit: 1, retryDelay: 60 },
};

export interface PgBossQueueOptions {
  readonly connectionString: string;
  /** When false the instance only enqueues and reads; no polling, cron or maintenance runs. */
  readonly workersEnabled: boolean;
  readonly pollingIntervalSeconds: number;
  readonly onError: (error: Error) => void;
}

const errorMessage = (output: unknown): string | null => {
  if (typeof output !== 'object' || output === null) return null;
  const message = (output as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
};

const ensureQueue = async (boss: PgBoss, name: JobName): Promise<void> => {
  if ((await boss.getQueue(name)) !== null) return;
  const opts = QUEUE_OPTIONS_OVERRIDES[name] ?? QUEUE_OPTIONS;
  try {
    await boss.createQueue(name, opts);
  } catch (error) {
    // Two API instances booting together race on the insert; the loser can carry on.
    if ((await boss.getQueue(name)) === null) throw error;
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts pg-boss on the application database (schema `pgboss`, created and migrated on boot). */
export const createPgBossQueue = async (options: PgBossQueueOptions): Promise<JobQueue> => {
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: PGBOSS_SCHEMA,
    schedule: options.workersEnabled,
    supervise: options.workersEnabled,
    migrate: true,
  });
  boss.on('error', options.onError);
  await boss.start();
  for (const name of JOB_NAMES) await ensureQueue(boss, name);

  const toStatus = (job: {
    id: string;
    name: string;
    state: JobState;
    data: unknown;
    output: unknown;
    createdOn: Date;
    completedOn: Date | null;
  }): JobStatus => ({
    id: job.id,
    name: job.name,
    state: job.state,
    data: job.data,
    error: job.state === 'failed' ? (errorMessage(job.output) ?? 'Job failed') : null,
    output: job.state === 'completed' ? job.output : null,
    createdOn: job.createdOn,
    completedOn: job.completedOn,
  });

  return {
    send: (name, data, options?: SendOptions) => {
      const sendOpts: Record<string, unknown> = {};
      if (options?.startAfter !== undefined) sendOpts.startAfter = options.startAfter;
      if (options?.singletonKey !== undefined) sendOpts.singletonKey = options.singletonKey;
      return boss.send(name, data, sendOpts);
    },
    getJob: async (name, id) => {
      const job = await boss.getJobById(name, id);
      return job === null ? null : toStatus(job);
    },
    work: async <N extends JobName>(name: N, handler: JobHandler<N>) => {
      await boss.work<JobPayloads[N]>(
        name,
        { pollingIntervalSeconds: options.pollingIntervalSeconds, batchSize: 1 },
        async (jobs) => {
          const job = jobs[0];
          if (job === undefined) return undefined;
          return handler({ id: job.id, data: job.data });
        },
      );
    },
    schedule: async (name, cron, data) => {
      await boss.schedule(name, cron, data, { tz: 'UTC' });
    },
    stop: async () => {
      const stopped = new Promise<void>((resolve) => boss.once('stopped', () => resolve()));
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS, close: true });
      await Promise.race([stopped, sleep(STOP_TIMEOUT_MS)]);
    },
  };
};
