import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createRevalidateHandler,
  REVALIDATE_SECRET_HEADER,
} from '../../../src/jobs/revalidate.job';
import { LEDGER_CHECK_CRON } from '../../../src/modules/inventory/ledger-check.job';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { getPrisma, getPrismaRaw, resetDb, seedMinimal } from '../../helpers/db';
import { listQueuedJobs, resetJobs, waitForJob } from '../../helpers/jobs';

interface Received {
  readonly secret: string | undefined;
  readonly body: unknown;
}

const startStub = async (
  status = 200,
): Promise<{ server: Server; origin: string; received: Received[] }> => {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      received.push({
        secret: req.headers[REVALIDATE_SECRET_HEADER] as string | undefined,
        body: JSON.parse(raw),
      });
      res.writeHead(status, { 'content-type': 'application/json' }).end('{"success":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}`, received };
};

describe('revalidate job', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetJobs();
    await seedMinimal(getPrisma());
  });

  it('posts the tags with the shared secret to the web stub', async () => {
    const stub = await startStub();
    try {
      const handler = createRevalidateHandler({
        webOrigin: stub.origin,
        secret: testApp.env.REVALIDATE_SECRET,
        sleep: async () => undefined,
      });

      const result = await handler({ tags: ['product:x', 'home'] });

      expect(result).toEqual({ revalidated: ['product:x', 'home'], attempts: 1 });
      expect(stub.received).toEqual([
        { secret: testApp.env.REVALIDATE_SECRET, body: { tags: ['product:x', 'home'] } },
      ]);
    } finally {
      stub.server.close();
    }
  });

  it('is enqueued by the notifier and, with workers enabled, delivered by pg-boss', async () => {
    const stub = await startStub();
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true', WEB_ORIGIN: stub.origin } });
    try {
      const jobId = await worker.app.revalidate.notify(['home', 'search', 'home']);
      const queued = await listQueuedJobs('revalidate');
      const job = await waitForJob(worker, 'revalidate', jobId ?? '');

      expect(queued.map((row) => row.data)).toEqual([{ tags: ['home', 'search'] }]);
      expect(job.state).toBe('completed');
      expect(job.output).toEqual({ revalidated: ['home', 'search'], attempts: 1 });
      expect(stub.received[0]?.body).toEqual({ tags: ['home', 'search'] });
    } finally {
      await worker.close();
      stub.server.close();
    }
  });

  it('fails the job after the retry ladder when the web app keeps answering 500', async () => {
    const stub = await startStub(500);
    try {
      const handler = createRevalidateHandler({
        webOrigin: stub.origin,
        secret: 'x',
        sleep: async () => undefined,
      });

      await expect(handler({ tags: ['home'] })).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
      expect(stub.received).toHaveLength(4);
    } finally {
      stub.server.close();
    }
  });

  it('schedules the nightly ledger-check at 02:00 IST and runs it through the worker', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const schedules = await getPrismaRaw().$queryRawUnsafe<{ name: string; cron: string }[]>(
        'SELECT name, cron FROM pgboss.schedule WHERE name = $1',
        'ledger-check',
      );
      const jobId = await worker.app.jobs.send('ledger-check', { trigger: 'manual' });
      const job = await waitForJob(worker, 'ledger-check', jobId ?? '');
      const audit = await getPrisma().auditLog.findFirst({
        where: { action: 'inventory.ledger_check' },
      });
      const variants = await getPrisma().productVariant.count();

      expect(schedules).toEqual([{ name: 'ledger-check', cron: LEDGER_CHECK_CRON }]);
      expect(LEDGER_CHECK_CRON).toBe('30 20 * * *');
      expect(job.state).toBe('completed');
      expect(job.output).toMatchObject({ checked: variants, drift: [] });
      expect(audit?.after).toMatchObject({ trigger: 'manual', checked: variants });
    } finally {
      await worker.close();
    }
  });
});
