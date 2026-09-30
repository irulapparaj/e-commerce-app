import { createPgBossQueue } from '../jobs/boss';
import type { JobQueue } from '../jobs/queue';
import { sharedPlugin } from '../lib/plugin';

export interface JobsPluginOptions {
  /** Tests may inject a queue; production builds pg-boss on DATABASE_URL. */
  readonly queue?: JobQueue;
}

const POLLING_SECONDS_TEST = 0.5;
const POLLING_SECONDS_DEFAULT = 2;

/** Decorates `app.jobs` (P04 task 1). Workers themselves are registered by `jobs/register.ts`. */
export const jobsPlugin = sharedPlugin<JobsPluginOptions>(async (app, options) => {
  const queue =
    options.queue ??
    (await createPgBossQueue({
      connectionString: app.env.DATABASE_URL,
      workersEnabled: app.env.JOBS_ENABLED,
      pollingIntervalSeconds:
        app.env.NODE_ENV === 'test' ? POLLING_SECONDS_TEST : POLLING_SECONDS_DEFAULT,
      onError: (error) => app.log.error({ err: error }, 'pg-boss error'),
    }));
  app.decorate('jobs', queue);
  app.addHook('onClose', async () => {
    await queue.stop();
  });
});
