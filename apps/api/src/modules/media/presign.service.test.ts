import { describe, expect, it, vi } from 'vitest';

import type { JobQueue } from '../../jobs/queue';
import type { ObjectStoragePort } from '../../ports/object-storage';

import { createMediaPresignService, PRESIGN_TTL_SECONDS } from './presign.service';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const KEY_PATTERN = new RegExp(`^products/${PRODUCT_ID}/[0-9a-f-]{36}\\.png$`);

const build = (imageCount = 0, exists = true) => {
  const presignPut = vi.fn(
    async (input: { key: string; contentType: string; sizeBytes: number }) => ({
      url: `https://minio/media/${input.key}?sig`,
      method: 'PUT' as const,
      headers: { 'content-type': input.contentType, 'content-length': String(input.sizeBytes) },
    }),
  );
  const storage = {
    presignPut,
    head: vi.fn(async () => ({ exists })),
  } as unknown as ObjectStoragePort;
  const send = vi.fn(async () => 'job-9');
  const jobs = { send } as unknown as JobQueue;
  const prisma = {
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === PRODUCT_ID ? { id: PRODUCT_ID, _count: { images: imageCount } } : null,
      ),
    },
    category: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === CATEGORY_ID ? { id: CATEGORY_ID } : null,
      ),
    },
    productImage: {},
  };
  const now = () => new Date('2026-09-26T00:00:00Z');
  return {
    service: createMediaPresignService({
      prisma: prisma as never,
      storage,
      bucket: 'media',
      jobs,
      now,
    }),
    presignPut,
    send,
  };
};

describe('media presign service', () => {
  it('presigns a server-generated key with fixed content type, length and a 5 minute expiry', async () => {
    const { service, presignPut } = build();

    const upload = await service.presignProductImage({
      productId: PRODUCT_ID,
      contentType: 'image/png',
      contentLength: 1234,
    });

    expect(upload.key).toMatch(KEY_PATTERN);
    expect(upload.headers).toEqual({ 'content-type': 'image/png', 'content-length': '1234' });
    expect(upload.expiresAt).toBe(
      new Date(Date.parse('2026-09-26T00:00:00Z') + PRESIGN_TTL_SECONDS * 1000).toISOString(),
    );
    expect(presignPut).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'media', maxBytes: 10 * 1024 * 1024, expiresSec: 300 }),
    );
  });

  it('refuses when the product is missing, full, or the size is out of range', async () => {
    await expect(
      build().service.presignProductImage({
        productId: CATEGORY_ID,
        contentType: 'image/png',
        contentLength: 10,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      build(12).service.presignProductImage({
        productId: PRODUCT_ID,
        contentType: 'image/png',
        contentLength: 10,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      build().service.presignProductImage({
        productId: PRODUCT_ID,
        contentType: 'image/png',
        contentLength: 11 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      build().service.presignCategoryImage({
        categoryId: PRODUCT_ID,
        contentType: 'image/webp',
        contentLength: 10,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('confirms only keys under the target prefix that actually exist, then enqueues the job', async () => {
    const { service, send } = build();
    const key = (
      await service.presignProductImage({
        productId: PRODUCT_ID,
        contentType: 'image/jpeg',
        contentLength: 10,
      })
    ).key;

    const confirmed = await service.confirmUpload(key, {
      kind: 'product',
      productId: PRODUCT_ID,
      alt: 'Front',
    });

    expect(confirmed).toEqual({ jobId: 'job-9' });
    expect(send).toHaveBeenCalledWith('media-process', {
      key,
      target: { kind: 'product', productId: PRODUCT_ID, alt: 'Front' },
    });
    await expect(
      service.confirmUpload(key, { kind: 'product', productId: CATEGORY_ID, alt: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      service.confirmUpload('../../etc/passwd', {
        kind: 'product',
        productId: PRODUCT_ID,
        alt: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      service.confirmUpload(key.replace('.jpg', '.svg'), {
        kind: 'product',
        productId: PRODUCT_ID,
        alt: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      build(0, false).service.confirmUpload(key, {
        kind: 'product',
        productId: PRODUCT_ID,
        alt: '',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
