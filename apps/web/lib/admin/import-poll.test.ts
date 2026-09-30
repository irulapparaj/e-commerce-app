import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { IMPORT_ID, QUEUE_JOB_ID, queueJob, validatedJob } from '@/test-utils/import';

import { fetchImportJob, requestImportStep, settleImportStep, waitForJob } from './import-poll';

const noSleep = async () => undefined;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('waitForJob', () => {
  it('polls until the queue job settles and resolves on completion', async () => {
    const calls = stubFetch((_call, index) =>
      okEnvelope(queueJob(index === 1 ? 'created' : index === 2 ? 'active' : 'completed')),
    );
    const sleep = vi.fn(noSleep);

    const job = await waitForJob(QUEUE_JOB_ID, { intervalMs: 7, sleep });

    expect(job.state).toBe('completed');
    expect(calls.map((call) => call.url)).toEqual(
      Array.from({ length: 3 }, () => `/api/v1/admin/jobs/${QUEUE_JOB_ID}`),
    );
    expect(sleep.mock.calls).toEqual([[7], [7]]);
  });

  it('resolves, not rejects, on a failed or cancelled job so the import status can be read', async () => {
    stubFetch((_call, index) =>
      okEnvelope(queueJob(index === 1 ? 'failed' : 'cancelled', 'rolled back')),
    );

    await expect(waitForJob(QUEUE_JOB_ID, { sleep: noSleep })).resolves.toMatchObject({
      state: 'failed',
      error: 'rolled back',
    });
    await expect(waitForJob(QUEUE_JOB_ID, { sleep: noSleep })).resolves.toMatchObject({
      state: 'cancelled',
    });
  });

  it('gives up after the timeout and propagates API failures', async () => {
    stubFetch(() => okEnvelope(queueJob('active')));
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });

    await expect(
      waitForJob(QUEUE_JOB_ID, { intervalMs: 1000, timeoutMs: 2500, sleep, now: () => clock }),
    ).rejects.toThrow('taking too long');
    expect(sleep).toHaveBeenCalledTimes(3);

    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'Job not found'));
    await expect(waitForJob(QUEUE_JOB_ID, { sleep: noSleep })).rejects.toThrow('Job not found');
  });
});

describe('import steps', () => {
  it('requests validate/apply and returns the queue job id', async () => {
    const calls = stubFetch(() => okEnvelope({ jobId: QUEUE_JOB_ID }));

    await expect(requestImportStep(IMPORT_ID, 'validate')).resolves.toBe(QUEUE_JOB_ID);
    await expect(requestImportStep(IMPORT_ID, 'apply')).resolves.toBe(QUEUE_JOB_ID);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', `/api/v1/admin/import/${IMPORT_ID}/validate`],
      ['POST', `/api/v1/admin/import/${IMPORT_ID}/apply`],
    ]);
  });

  it('settles a step by waiting for the job and re-reading the import', async () => {
    const calls = stubFetch((call) =>
      call.url.includes('/jobs/') ? okEnvelope(queueJob('completed')) : okEnvelope(validatedJob),
    );

    await expect(fetchImportJob(IMPORT_ID)).resolves.toEqual(validatedJob);
    await expect(settleImportStep(IMPORT_ID, QUEUE_JOB_ID, { sleep: noSleep })).resolves.toEqual(
      validatedJob,
    );
    expect(calls.map((call) => call.url)).toEqual([
      `/api/v1/admin/import/${IMPORT_ID}`,
      `/api/v1/admin/jobs/${QUEUE_JOB_ID}`,
      `/api/v1/admin/import/${IMPORT_ID}`,
    ]);
  });
});
