import { describe, expect, it, vi } from 'vitest';

import type { ObjectStoragePort } from '../../ports/object-storage';

import { createImageUrlBuilder, derivativeKey } from './url';

const storage = () => {
  const presignGet = vi.fn(async ({ key, expiresSec }: { key: string; expiresSec: number }) => ({
    url: `https://minio/media/${key}?X-Amz-Expires=${expiresSec}&sig=abc`,
  }));
  const port = {
    presignGet,
    presignPut: vi.fn(),
    head: vi.fn(),
    delete: vi.fn(),
    getStream: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
    headBucket: vi.fn(),
  } as unknown as ObjectStoragePort;
  return { port, presignGet };
};

describe('image URL builder', () => {
  it('names derivatives deterministically from the base key', () => {
    expect(derivativeKey('products/p1/abc', 640, 'avif')).toBe('products/p1/abc-640.avif');
  });

  it('uses the public base URL when configured and never signs', async () => {
    const { port, presignGet } = storage();
    const urls = createImageUrlBuilder({
      publicBaseUrl: 'https://cdn.example.com/media/',
      storage: port,
      bucket: 'media',
    });

    const image = await urls.imageUrls('products/p1/abc', 'Front');

    expect(image.src).toBe('https://cdn.example.com/media/products/p1/abc-1024.webp');
    expect(image.srcset.webp).toBe(
      'https://cdn.example.com/media/products/p1/abc-320.webp 320w, https://cdn.example.com/media/products/p1/abc-640.webp 640w, https://cdn.example.com/media/products/p1/abc-1024.webp 1024w, https://cdn.example.com/media/products/p1/abc-1600.webp 1600w',
    );
    expect(image.srcset.avif).toContain('abc-1600.avif 1600w');
    expect(image.alt).toBe('Front');
    expect(presignGet).not.toHaveBeenCalled();
  });

  it('falls back to one-hour presigned GET URLs', async () => {
    const { port, presignGet } = storage();
    const urls = createImageUrlBuilder({ storage: port, bucket: 'media' });

    const url = await urls.url('categories/c1/xyz', 640, 'webp');
    const image = await urls.imageUrls('products/p1/abc', '');

    expect(url).toBe('https://minio/media/categories/c1/xyz-640.webp?X-Amz-Expires=3600&sig=abc');
    expect(image.srcset.avif.split(', ')).toHaveLength(4);
    expect(presignGet).toHaveBeenCalledTimes(1 + 1 + 8);
  });
});
