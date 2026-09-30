import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { ImageUrlBuilder } from '../media/url';

import {
  gstRateOf,
  type ProductSummaryRow,
  specificationsOf,
  stockFlags,
  toProductSummary,
  toVariantDto,
  type VariantRow,
} from './dto';

const urls: ImageUrlBuilder = {
  url: async (base, width, format) => `https://cdn/${base}-${width}.${format}`,
  imageUrls: async (base, alt) => ({
    alt,
    src: `https://cdn/${base}-1024.webp`,
    srcset: { webp: 'w', avif: 'a' },
  }),
};

const variant = (overrides: Partial<VariantRow>): VariantRow => ({
  id: 'v1',
  productId: 'p1',
  sku: 'SKU-1',
  label: '50 g',
  price: 8000,
  compareAtPrice: 9500,
  stock: 12,
  lowStockThreshold: 10,
  weightGrams: 70,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const row = (
  variants: VariantRow[],
  images: ProductSummaryRow['images'] = [],
): ProductSummaryRow => ({
  id: 'p1',
  name: 'Pure Camphor',
  slug: 'pure-camphor',
  sku: 'PE-1',
  description: {},
  specifications: { Quantity: '100 g', Weight: 5 },
  howToUse: null,
  categoryId: 'c1',
  hsnCode: '2914',
  gstRate: new Prisma.Decimal('18.00'),
  tags: [],
  isActive: true,
  isFeatured: true,
  metaTitle: null,
  metaDescription: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { id: 'c1', slug: 'camphor', name: 'Camphor', parentId: null },
  variants,
  images,
});

const randomInt = (max: number) => Math.floor(Math.random() * max);

describe('product DTO mappers', () => {
  it('takes price from the default variant and the first image', async () => {
    const dto = await toProductSummary(
      row(
        [
          variant({ id: 'cheap', isDefault: false, price: 100 }),
          variant({ id: 'default', isDefault: true, price: 8000 }),
        ],
        [
          {
            id: 'i1',
            productId: 'p1',
            objectKey: 'products/p1/a',
            alt: 'front',
            sortOrder: 0,
            createdAt: new Date(),
          },
        ],
      ),
      urls,
    );

    expect(dto.priceFrom).toBe(8000);
    expect(dto.compareAtFrom).toBe(9500);
    expect(dto.image?.alt).toBe('front');
    expect(dto.ratingSummary).toEqual({ avg: 0, count: 0 });
  });

  it('never exposes stock numbers, only booleans (property test over random stocks)', async () => {
    for (let round = 0; round < 200; round += 1) {
      const variants = Array.from({ length: 1 + randomInt(4) }, (_, index) =>
        variant({
          id: `v${index}`,
          isDefault: index === 0,
          stock: randomInt(50),
          lowStockThreshold: randomInt(20),
        }),
      );
      const dto = await toProductSummary(row(variants), urls);
      const json = JSON.stringify({ summary: dto, variants: variants.map(toVariantDto) });

      expect(json).not.toMatch(/"stock"/);
      expect(json).not.toMatch(/"lowStockThreshold"/);
      expect(Object.keys(dto).sort()).toEqual([
        'categorySlug',
        'compareAtFrom',
        'defaultVariantId',
        'id',
        'image',
        'inStock',
        'isFeatured',
        'lowStock',
        'name',
        'priceFrom',
        'ratingSummary',
        'slug',
      ]);
      const primary = variants[0]!;
      expect(dto.inStock).toBe(variants.some((v) => v.stock > 0));
      expect(dto.lowStock).toBe(primary.stock > 0 && primary.stock <= primary.lowStockThreshold);
    }
  });

  it('computes stock flags from the default variant', () => {
    expect(stockFlags([variant({ stock: 0 })])).toEqual({ inStock: false, lowStock: false });
    expect(stockFlags([variant({ stock: 3, lowStockThreshold: 5 })])).toEqual({
      inStock: true,
      lowStock: true,
    });
    expect(
      stockFlags([
        variant({ stock: 0, isDefault: true }),
        variant({ id: 'v2', stock: 4, isDefault: false }),
      ]),
    ).toEqual({ inStock: true, lowStock: false });
    expect(stockFlags([])).toEqual({ inStock: false, lowStock: false });
  });

  it('handles products without variants or images', async () => {
    const dto = await toProductSummary(row([]), urls);

    expect(dto.priceFrom).toBe(0);
    expect(dto.compareAtFrom).toBeNull();
    expect(dto.image).toBeNull();
  });

  it('keeps only string specifications and converts decimals', () => {
    expect(specificationsOf({ Quantity: '100 g', Weight: 5 })).toEqual({ Quantity: '100 g' });
    expect(specificationsOf(null)).toEqual({});
    expect(specificationsOf(['x'])).toEqual({});
    expect(gstRateOf(new Prisma.Decimal('12.00'))).toBe(12);
    expect(gstRateOf(5)).toBe(5);
  });
});
