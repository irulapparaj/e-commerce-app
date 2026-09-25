import { fail, ok } from '@pe/shared';

import { sharedPlugin } from '../lib/plugin';
import { withTimeout } from '../lib/timeout';

const CHECK_TIMEOUT_MS = 2_000;

export interface ReadinessCheck {
  readonly name: string;
  readonly check: () => Promise<unknown>;
}

export interface ReadinessRegistry {
  add(check: ReadinessCheck): void;
  run(): Promise<readonly CheckResult[]>;
}

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly error?: string;
}

const runCheck = async ({ name, check }: ReadinessCheck): Promise<CheckResult> => {
  try {
    await withTimeout(check(), CHECK_TIMEOUT_MS, name);
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : 'failed' };
  }
};

export const createReadinessRegistry = (): ReadinessRegistry => {
  const checks = new Map<string, ReadinessCheck>();
  return {
    add: (check) => {
      checks.set(check.name, check);
    },
    run: () => Promise.all([...checks.values()].map(runCheck)),
  };
};

export const healthPlugin = sharedPlugin(async (app) => {
  const readiness = createReadinessRegistry();
  app.decorate('readiness', readiness);

  app.get('/healthz', async () => ok({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    const results = await readiness.run();
    const checks = Object.fromEntries(
      results.map((r) => [r.name, r.ok ? 'ok' : (r.error ?? 'failed')]),
    );
    if (results.every((r) => r.ok)) return ok({ status: 'ready', checks });
    return reply
      .status(503)
      .send(fail({ code: 'SERVICE_UNAVAILABLE', message: 'Not ready', details: { checks } }));
  });
});
