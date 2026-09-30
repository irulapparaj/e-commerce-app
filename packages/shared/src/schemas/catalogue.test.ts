import { describe, expect, it } from 'vitest';

import {
  categoryInputSchema,
  imageConfirmSchema,
  imagePresignSchema,
  inventoryAdjustSchema,
  isAllowedImageType,
  needsStepUpForAdjustment,
  productCommercialPatchSchema,
  productContentPatchSchema,
  productContentSchema,
  variantCreateSchema,
  variantPriceSchema,
} from './catalogue';

const CATEGORY_ID = '5f2b5d6e-8c3a-4b1e-9f0d-1a2b3c4d5e6f';

const content = {
  name: 'Pure Camphor',
  sku: 'PE-PS-001',
  categoryId: CATEGORY_ID,
  description: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
  },
  specifications: { Quantity: '100 g' },
  howToUse: null,
  tags: ['camphor'],
};

describe('product schemas', () => {
  it('accepts content input and rejects commercial fields on the content route', () => {
    expect(productContentSchema.safeParse(content).success).toBe(true);
    expect(productContentSchema.safeParse({ ...content, price: 100 }).success).toBe(false);
    expect(productContentPatchSchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(productContentPatchSchema.safeParse({ name: 'x', isFeatured: true }).success).toBe(
      false,
    );
    expect(productContentPatchSchema.safeParse({}).success).toBe(false);
  });

  it('validates sku, specifications and tags bounds', () => {
    expect(productContentSchema.safeParse({ ...content, sku: 'bad sku' }).success).toBe(false);
    expect(
      productContentSchema.safeParse({ ...content, specifications: { '': 'x' } }).success,
    ).toBe(false);
    expect(
      productContentSchema.safeParse({
        ...content,
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }).success,
    ).toBe(false);
    expect(
      productContentSchema.safeParse({
        ...content,
        description: { type: 'doc', content: [{ type: 'script' }] },
      }).success,
    ).toBe(false);
  });

  it('accepts commercial patches with valid HSN and GST and rejects content fields there', () => {
    expect(productCommercialPatchSchema.safeParse({ hsnCode: '3307', gstRate: 5 }).success).toBe(
      true,
    );
    expect(productCommercialPatchSchema.safeParse({ hsnCode: '33071', gstRate: 5 }).success).toBe(
      false,
    );
    expect(productCommercialPatchSchema.safeParse({ gstRate: 28 }).success).toBe(false);
    expect(productCommercialPatchSchema.safeParse({ name: 'x' }).success).toBe(false);
  });
});

describe('variant schemas', () => {
  it('requires compareAtPrice above price when present', () => {
    expect(variantPriceSchema.safeParse({ price: 8000, compareAtPrice: null }).success).toBe(true);
    expect(variantPriceSchema.safeParse({ price: 8000, compareAtPrice: 9500 }).success).toBe(true);
    expect(variantPriceSchema.safeParse({ price: 8000, compareAtPrice: 8000 }).success).toBe(false);
    expect(variantPriceSchema.safeParse({ price: 0, compareAtPrice: null }).success).toBe(false);
    expect(variantPriceSchema.safeParse({ price: 80.5, compareAtPrice: null }).success).toBe(false);
  });

  it('create combines content and price and stays strict', () => {
    const base = {
      sku: 'PE-1-50',
      label: '50 g',
      weightGrams: 70,
      isDefault: true,
      lowStockThreshold: 10,
      price: 8000,
      compareAtPrice: null,
    };

    expect(variantCreateSchema.safeParse(base).success).toBe(true);
    expect(variantCreateSchema.safeParse({ ...base, stock: 5 }).success).toBe(false);
    expect(variantCreateSchema.safeParse({ ...base, compareAtPrice: 100 }).success).toBe(false);
  });
});

describe('category, image and inventory schemas', () => {
  it('validates category input without accepting a slug or image key from the client', () => {
    expect(
      categoryInputSchema.safeParse({
        name: 'Camphor',
        parentId: null,
        metaTitle: null,
        metaDescription: null,
      }).success,
    ).toBe(true);
    expect(
      categoryInputSchema.safeParse({
        name: 'Camphor',
        parentId: null,
        slug: 'camphor',
        metaTitle: null,
        metaDescription: null,
      }).success,
    ).toBe(false);
    expect(
      categoryInputSchema.safeParse({
        name: 'Camphor',
        parentId: 'x',
        metaTitle: null,
        metaDescription: null,
      }).success,
    ).toBe(false);
  });

  it('limits presign to raster types and 10 MB', () => {
    expect(
      imagePresignSchema.safeParse({ contentType: 'image/png', contentLength: 1024 }).success,
    ).toBe(true);
    expect(
      imagePresignSchema.safeParse({ contentType: 'image/svg+xml', contentLength: 1024 }).success,
    ).toBe(false);
    expect(
      imagePresignSchema.safeParse({ contentType: 'image/jpeg', contentLength: 11 * 1024 * 1024 })
        .success,
    ).toBe(false);
    expect(isAllowedImageType('image/webp')).toBe(true);
    expect(isAllowedImageType('application/pdf')).toBe(false);
    const confirmed = imageConfirmSchema.parse({ key: 'products/x/y.png' });
    expect(confirmed.alt).toBe('');
  });

  it('requires a non-zero delta and a five character note; step-up above 100 units', () => {
    expect(inventoryAdjustSchema.safeParse({ delta: -5, note: 'damaged box' }).success).toBe(true);
    expect(inventoryAdjustSchema.safeParse({ delta: 0, note: 'damaged box' }).success).toBe(false);
    expect(inventoryAdjustSchema.safeParse({ delta: 5, note: 'bad' }).success).toBe(false);
    expect(inventoryAdjustSchema.safeParse({ delta: 1.5, note: 'damaged box' }).success).toBe(
      false,
    );
    expect(needsStepUpForAdjustment(100)).toBe(false);
    expect(needsStepUpForAdjustment(-100)).toBe(false);
    expect(needsStepUpForAdjustment(101)).toBe(true);
    expect(needsStepUpForAdjustment(-101)).toBe(true);
  });
});
