import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readMetadata } from '../../../src/modules/media/derivatives';
import { processMedia } from '../../../src/modules/media/process.job';
import {
  derivativeKey,
  DERIVATIVE_FORMATS,
  DERIVATIVE_WIDTHS,
} from '../../../src/modules/media/url';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs, revalidateTagsEnqueued, waitForJob } from '../../helpers/jobs';

const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/media');
const fixture = (name: string): Buffer => readFileSync(resolve(FIXTURES, name));
const BUCKET = 'media';

describe('media pipeline against MinIO', () => {
  let testApp: TestApp;
  let categoryId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
  });

  const upload = async (
    productId: string,
    contentType: 'image/png' | 'image/jpeg' | 'image/avif',
    body: Buffer,
  ) => {
    const presigned = await testApp.app.media.presignProductImage({
      productId,
      contentType,
      contentLength: body.length,
    });
    const put = await fetch(presigned.url, { method: 'PUT', headers: presigned.headers, body });
    expect(put.status).toBe(200);
    return presigned.key;
  };

  const readAll = async (key: string): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of await testApp.ports.storage.getStream({ bucket: BUCKET, key }))
      chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  };

  it('presign refuses oversized files and MinIO refuses a PUT whose content-type differs from the signed one', async () => {
    const product = await createProduct(testApp, {
      name: 'Media host',
      categoryId,
      withImage: false,
      active: false,
    });

    await expect(
      testApp.app.media.presignProductImage({
        productId: product.id,
        contentType: 'image/png',
        contentLength: 11 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const presigned = await testApp.app.media.presignProductImage({
      productId: product.id,
      contentType: 'image/png',
      contentLength: 100,
    });
    const spoofed = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/svg+xml', 'content-length': '100' },
      body: Buffer.alloc(100, 1),
    });

    expect(presigned.key).toMatch(new RegExp(`^products/${product.id}/[0-9a-f-]{36}\\.png$`));
    expect(spoofed.status).toBe(403);
  });

  it('processes a PNG into eight derivatives, deletes the original, inserts the image row and revalidates', async () => {
    const product = await createProduct(testApp, {
      name: 'PNG product',
      categoryId,
      withImage: false,
      active: false,
    });
    const key = await upload(product.id, 'image/png', fixture('sample.png'));
    await resetJobs();

    const result = await processMedia(testApp.app.media.processDeps, {
      key,
      target: { kind: 'product', productId: product.id, alt: 'Sample' },
    });
    const base = key.replace(/\.png$/, '');
    const heads = await Promise.all(
      DERIVATIVE_WIDTHS.flatMap((w) =>
        DERIVATIVE_FORMATS.map((f) =>
          testApp.ports.storage.head({ bucket: BUCKET, key: derivativeKey(base, w, f) }),
        ),
      ),
    );
    const original = await testApp.ports.storage.head({ bucket: BUCKET, key });
    const rows = await getPrisma().productImage.findMany({ where: { productId: product.id } });
    const detail = await getPrisma().productImage.findFirstOrThrow({
      where: { productId: product.id },
    });

    expect(result).toMatchObject({ base, derivatives: 8, width: 1400, height: 1000 });
    expect(heads.every((head) => head.exists)).toBe(true);
    expect(heads.map((head) => head.contentType).sort()).toEqual([
      ...Array<string>(4).fill('image/avif'),
      ...Array<string>(4).fill('image/webp'),
    ]);
    expect(original.exists).toBe(false);
    expect(rows).toHaveLength(1);
    expect(detail).toMatchObject({ objectKey: base, alt: 'Sample', sortOrder: 0 });
    const notified = await revalidateTagsEnqueued();
    expect(notified).toHaveLength(1);
    expect(notified[0]).toEqual(
      expect.arrayContaining(['category:agarbatti', `product:${product.slug}`, 'search', 'home']),
    );
  });

  it('strips EXIF from a rotated JPEG', async () => {
    const product = await createProduct(testApp, {
      name: 'EXIF product',
      categoryId,
      withImage: false,
      active: false,
    });
    const key = await upload(product.id, 'image/jpeg', fixture('exif.jpg'));

    const { base } = await processMedia(testApp.app.media.processDeps, {
      key,
      target: { kind: 'product', productId: product.id, alt: '' },
    });
    const meta = await readMetadata(await readAll(derivativeKey(base, 640, 'webp')));

    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.width).toBe(640);
    expect(meta.height).toBeGreaterThan(640);
  });

  it.each([
    ['polyglot.png', 'image/png' as const, 'not a decodable image'],
    ['pdf-as.jpg', 'image/jpeg' as const, 'application/pdf'],
  ])('rejects and deletes %s', async (name, contentType, reason) => {
    const product = await createProduct(testApp, {
      name: `Bad ${name}`,
      categoryId,
      withImage: false,
      active: false,
    });
    const key = await upload(product.id, contentType, fixture(name));

    await expect(
      processMedia(testApp.app.media.processDeps, {
        key,
        target: { kind: 'product', productId: product.id, alt: '' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const head = await testApp.ports.storage.head({ bucket: BUCKET, key });
    const audit = await getPrisma().auditLog.findFirst({
      where: { action: 'media.rejected', entityId: key },
    });

    expect(head.exists).toBe(false);
    expect(await getPrisma().productImage.count({ where: { productId: product.id } })).toBe(0);
    expect(JSON.stringify(audit?.after)).toContain(reason);
  });

  it('sets a category image through the same pipeline', async () => {
    const presigned = await testApp.app.media.presignCategoryImage({
      categoryId,
      contentType: 'image/avif',
      contentLength: fixture('sample.avif').length,
    });
    await fetch(presigned.url, {
      method: 'PUT',
      headers: presigned.headers,
      body: fixture('sample.avif'),
    });

    const { base } = await processMedia(testApp.app.media.processDeps, {
      key: presigned.key,
      target: { kind: 'category', categoryId },
    });
    const category = await getPrisma().category.findUniqueOrThrow({ where: { id: categoryId } });
    const tree = await testApp.app.inject({ method: 'GET', url: '/api/v1/categories' });

    expect(presigned.key).toMatch(new RegExp(`^categories/${categoryId}/`));
    expect(category.imageKey).toBe(base);
    expect(tree.body).toContain(`${base}-640.webp`);
  });

  it('runs end to end through pg-boss when workers are enabled: confirm → job → completed', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const product = await createProduct(worker, {
        name: 'Worker product',
        categoryId,
        withImage: false,
        active: false,
      });
      const body = fixture('sample.png');
      const presigned = await worker.app.media.presignProductImage({
        productId: product.id,
        contentType: 'image/png',
        contentLength: body.length,
      });
      await fetch(presigned.url, { method: 'PUT', headers: presigned.headers, body });
      await expect(
        worker.app.media.confirmUpload(`products/${product.id}/${randomUUID()}.png`, {
          kind: 'product',
          productId: product.id,
          alt: '',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const { jobId } = await worker.app.media.confirmUpload(presigned.key, {
        kind: 'product',
        productId: product.id,
        alt: 'Worker',
      });
      const job = await waitForJob(worker, 'media-process', jobId);
      const images = await getPrisma().productImage.findMany({ where: { productId: product.id } });

      expect(job.state).toBe('completed');
      expect(job.error).toBeNull();
      expect(images).toHaveLength(1);
      expect(images[0]?.alt).toBe('Worker');
    } finally {
      await worker.close();
    }
  });
});
