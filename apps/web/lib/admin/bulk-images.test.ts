import { afterEach, describe, expect, it, vi } from 'vitest';

import { okEnvelope, stubFetch } from '@/test-utils/admin';
import { IDS } from '@/test-utils/catalogue';

import { parseImageFilename, productImagePaths, resolveProductBySku } from './bulk-images';

const row = (sku: string) => ({
  id: IDS.product,
  name: `Product ${sku}`,
  slug: sku.toLowerCase(),
  sku,
  isActive: true,
  isFeatured: false,
  category: { id: IDS.agarbatti, name: 'Agarbatti', slug: 'agarbatti' },
  variants: [],
  imageCount: 0,
  thumbUrl: null,
  updatedAt: '2026-09-25T00:00:00.000Z',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseImageFilename', () => {
  it('splits SKU-n.ext, keeping hyphens inside the SKU and ignoring case', () => {
    expect(parseImageFilename('IMP-AG-001-1.jpg')).toEqual({ sku: 'IMP-AG-001', index: 1 });
    expect(parseImageFilename('rose-02.PNG')).toEqual({ sku: 'rose', index: 2 });
    expect(parseImageFilename(' ROSE-3.webp ')).toEqual({ sku: 'ROSE', index: 3 });
    expect(parseImageFilename('ROSE-4.avif')).toEqual({ sku: 'ROSE', index: 4 });
  });

  it('rejects names without an index, a zero index or a non-image extension', () => {
    expect(parseImageFilename('photo.jpg')).toBeNull();
    expect(parseImageFilename('ROSE.jpg')).toBeNull();
    expect(parseImageFilename('ROSE-0.jpg')).toBeNull();
    expect(parseImageFilename('ROSE-1.gif')).toBeNull();
    expect(parseImageFilename('ROSE-1')).toBeNull();
  });
});

describe('resolveProductBySku', () => {
  it('searches by SKU and keeps only the exact match', async () => {
    const calls = stubFetch(() => okEnvelope([row('ROSE-GOLD'), row('ROSE')]));

    await expect(resolveProductBySku('ROSE')).resolves.toMatchObject({ sku: 'ROSE' });
    expect(calls[0]?.url).toBe('/api/v1/admin/products?q=ROSE&limit=5');
  });

  it('returns null when nothing matches exactly', async () => {
    stubFetch(() => okEnvelope([row('rose')]));

    await expect(resolveProductBySku('ROSE')).resolves.toBeNull();
  });

  it('derives the P06 presign and confirm paths', () => {
    expect(productImagePaths('p1')).toEqual({
      presignPath: '/admin/products/p1/images/presign',
      confirmPath: '/admin/products/p1/images/confirm',
    });
  });
});
