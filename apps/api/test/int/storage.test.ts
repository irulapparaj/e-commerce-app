import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';

const readAll = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

describe('S3ObjectStorageAdapter against MinIO', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('presigns a PUT that uploads with the fixed content type, then head finds it', async () => {
    const { storage } = testApp.ports;
    const key = `test/${randomUUID()}.txt`;
    const body = Buffer.from('hello minio');

    const upload = await storage.presignPut({
      bucket: 'media',
      key,
      contentType: 'text/plain',
      sizeBytes: body.length,
      maxBytes: 1024,
      expiresSec: 60,
    });
    const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
    const head = await storage.head({ bucket: 'media', key });

    expect(put.status).toBe(200);
    expect(head).toEqual({ exists: true, size: body.length, contentType: 'text/plain' });
  });

  it('rejects an upload larger than the signed size', async () => {
    const { storage } = testApp.ports;
    const key = `test/${randomUUID()}.bin`;

    const upload = await storage.presignPut({
      bucket: 'media',
      key,
      contentType: 'application/octet-stream',
      sizeBytes: 100,
      maxBytes: 1024,
      expiresSec: 60,
    });
    const put = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.alloc(200, 1),
    });

    expect(put.status).toBe(403);
    expect((await storage.head({ bucket: 'media', key })).exists).toBe(false);
  });

  it('refuses to presign when the declared size exceeds maxBytes', async () => {
    await expect(
      testApp.ports.storage.presignPut({
        bucket: 'media',
        key: 'x',
        contentType: 'image/png',
        sizeBytes: 5_000_001,
        maxBytes: 5_000_000,
        expiresSec: 60,
      }),
    ).rejects.toThrow('File size');
  });

  it('puts, streams, presigns GET and deletes objects', async () => {
    const { storage } = testApp.ports;
    const key = `test/${randomUUID()}.json`;

    await storage.put({
      bucket: 'imports',
      key,
      body: '{"ok":true}',
      contentType: 'application/json',
    });
    const streamed = await readAll(await storage.getStream({ bucket: 'imports', key }));
    const { url } = await storage.presignGet({ bucket: 'imports', key, expiresSec: 60 });
    const fetched = await fetch(url);
    await storage.delete({ bucket: 'imports', key });

    expect(streamed).toBe('{"ok":true}');
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe('{"ok":true}');
    expect((await storage.head({ bucket: 'imports', key })).exists).toBe(false);
    expect(await storage.headBucket('imports')).toBe(true);
    expect(await storage.headBucket(`missing-${randomUUID()}`)).toBe(false);
  });
});
