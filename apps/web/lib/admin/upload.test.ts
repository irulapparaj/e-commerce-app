import { afterEach, describe, expect, it, vi } from 'vitest';

import { okEnvelope, stubFetch } from '@/test-utils/admin';
import { FakeXhr, flushAsync as flush, installFakeXhr as installXhr } from '@/test-utils/xhr';

import {
  IMAGE_SIZE_MESSAGE,
  IMAGE_TYPE_MESSAGE,
  pollJob,
  presignAndUpload,
  UploadError,
  uploadWithProgress,
  validateImageFile,
} from './upload';

const png = (size = 10) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });
const presigned = {
  url: 'https://bucket.test/products/p1/abc.png?sig=1',
  key: 'products/p1/abc.png',
  headers: { 'content-type': 'image/png', 'content-length': '10' },
  expiresAt: '2026-09-26T00:05:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateImageFile', () => {
  it('rejects svg and oversized files before any request, accepts allowed types', () => {
    expect(validateImageFile({ name: 'x.svg', type: 'image/svg+xml', size: 10 })).toBe(
      IMAGE_TYPE_MESSAGE,
    );
    expect(
      validateImageFile({ name: 'x.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 }),
    ).toBe(IMAGE_SIZE_MESSAGE);
    expect(validateImageFile({ name: 'x.png', type: 'image/png', size: 10 * 1024 * 1024 })).toBe(
      null,
    );
    expect(validateImageFile({ name: 'x.webp', type: 'image/webp', size: 1 })).toBeNull();
  });
});

describe('uploadWithProgress', () => {
  it('PUTs the raw file with exactly the presigned headers and reports progress', async () => {
    installXhr();
    const onProgress = vi.fn();
    const file = png();

    const pending = uploadWithProgress({
      url: presigned.url,
      headers: presigned.headers,
      file,
      onProgress,
    });
    const xhr = FakeXhr.instances[0]!;
    xhr.progress(5, 10);
    xhr.respond(200);
    await pending;

    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe(presigned.url);
    expect(xhr.headers).toEqual(presigned.headers);
    expect(xhr.body).toBe(file);
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('rejects with the HTTP status when the bucket refuses the object', async () => {
    installXhr();

    const pending = uploadWithProgress({ url: 'u', headers: {}, file: png() });
    FakeXhr.instances[0]!.respond(403);

    await expect(pending).rejects.toMatchObject({ kind: 'status', status: 403 });
  });

  it('rejects as a network failure on error and as aborted on abort', async () => {
    installXhr();
    const first = uploadWithProgress({ url: 'u', headers: {}, file: png() });
    FakeXhr.instances[0]!.fail();
    await expect(first).rejects.toMatchObject({ kind: 'network' });

    const second = uploadWithProgress({ url: 'u', headers: {}, file: png() });
    FakeXhr.instances[1]!.onabort?.();
    await expect(second).rejects.toBeInstanceOf(UploadError);
  });
});

describe('presignAndUpload', () => {
  it('presigns, retries the PUT once after a network failure, then confirms with the key', async () => {
    installXhr();
    const calls = stubFetch((call) =>
      call.url.endsWith('/presign') ? okEnvelope(presigned) : okEnvelope({ jobId: 'job-1' }),
    );
    const onProgress = vi.fn();

    const pending = presignAndUpload({
      presignPath: '/admin/products/p1/images/presign',
      confirmPath: '/admin/products/p1/images/confirm',
      file: png(),
      alt: 'Front',
      onProgress,
    });
    await flush();
    FakeXhr.instances[0]!.progress(3, 10);
    FakeXhr.instances[0]!.fail();
    await flush();
    FakeXhr.instances[1]!.respond(200);
    const result = await pending;

    expect(result).toEqual({ jobId: 'job-1', key: presigned.key });
    expect(FakeXhr.instances).toHaveLength(2);
    expect(onProgress.mock.calls).toEqual([[0.3], [0], [1]]);
    expect(calls).toEqual([
      {
        url: '/api/v1/admin/products/p1/images/presign',
        method: 'POST',
        body: { contentType: 'image/png', contentLength: 10 },
      },
      {
        url: '/api/v1/admin/products/p1/images/confirm',
        method: 'POST',
        body: { key: presigned.key, alt: 'Front' },
      },
    ]);
  });

  it('gives up after the second network failure and never confirms', async () => {
    installXhr();
    const calls = stubFetch(() => okEnvelope(presigned));

    const pending = presignAndUpload({
      presignPath: '/x/presign',
      confirmPath: '/x/confirm',
      file: png(),
    });
    await flush();
    FakeXhr.instances[0]!.fail();
    await flush();
    FakeXhr.instances[1]!.fail();

    await expect(pending).rejects.toMatchObject({ kind: 'network' });
    expect(calls).toHaveLength(1);
  });

  it('does not retry an HTTP rejection and omits alt from the confirm body when absent', async () => {
    installXhr();
    const calls = stubFetch((call) =>
      call.url.endsWith('/presign') ? okEnvelope(presigned) : okEnvelope({ jobId: 'job-2' }),
    );

    const rejected = presignAndUpload({
      presignPath: '/x/presign',
      confirmPath: '/x/confirm',
      file: png(),
    });
    await flush();
    FakeXhr.instances[0]!.respond(400);
    await expect(rejected).rejects.toMatchObject({ kind: 'status', status: 400 });
    expect(FakeXhr.instances).toHaveLength(1);

    const accepted = presignAndUpload({
      presignPath: '/x/presign',
      confirmPath: '/x/confirm',
      file: png(),
    });
    await flush();
    FakeXhr.instances[1]!.respond(200);
    await accepted;
    expect(calls.at(-1)?.body).toEqual({ key: presigned.key });
  });

  it('rejects an svg client-side without touching the network', async () => {
    installXhr();
    const calls = stubFetch(() => okEnvelope(presigned));
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });

    await expect(
      presignAndUpload({ presignPath: '/x/presign', confirmPath: '/x/confirm', file: svg }),
    ).rejects.toThrow(IMAGE_TYPE_MESSAGE);
    expect(calls).toHaveLength(0);
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('pollJob', () => {
  const job = (state: string, error: string | null = null) => ({
    id: 'job-1',
    name: 'media-process',
    state,
    error,
    output: null,
  });

  it('polls until the job completes, sleeping between attempts', async () => {
    const calls = stubFetch((_call, index) =>
      okEnvelope(job(index < 3 ? (index === 1 ? 'created' : 'active') : 'completed')),
    );
    const sleep = vi.fn(async () => undefined);

    const result = await pollJob('job-1', { intervalMs: 5, sleep });

    expect(result.state).toBe('completed');
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toBe('/api/v1/admin/jobs/job-1');
    expect(sleep.mock.calls).toEqual([[5], [5]]);
  });

  it('surfaces the job error when processing fails', async () => {
    stubFetch(() => okEnvelope(job('failed', 'Unsupported image')));

    await expect(pollJob('job-1', { sleep: async () => undefined })).rejects.toThrow(
      'Unsupported image',
    );
  });

  it('falls back to a generic message for a cancelled job without error text', async () => {
    stubFetch(() => okEnvelope(job('cancelled')));

    await expect(pollJob('job-1', { sleep: async () => undefined })).rejects.toThrow(
      'Image processing failed',
    );
  });

  it('times out when the job never settles', async () => {
    stubFetch(() => okEnvelope(job('active')));
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });

    await expect(
      pollJob('job-1', { intervalMs: 1000, timeoutMs: 2500, sleep, now: () => clock }),
    ).rejects.toThrow('timed out');
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
