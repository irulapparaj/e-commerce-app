import type { Prisma } from '@prisma/client';

import type { ImageUrls, ImageUrlBuilder } from '../media/url';

/** Listings only ever show the first image, so the summary include stops at one row per product. */
export const PRODUCT_SUMMARY_INCLUDE = {
  category: { select: { id: true, slug: true, name: true, parentId: true } },
  variants: { orderBy: [{ isDefault: 'desc' }, { price: 'asc' }] },
  images: { orderBy: { sortOrder: 'asc' }, take: 1 },
} satisfies Prisma.ProductInclude;

export type ProductSummaryRow = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_SUMMARY_INCLUDE;
}>;
export type VariantRow = ProductSummaryRow['variants'][number];

export interface RatingSummary {
  readonly avg: number;
  readonly count: number;
}

/** Public listing card. Never carries stock numbers: only the booleans (DESIGN §11.3). */
export interface ProductSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly categorySlug: string;
  readonly defaultVariantId: string | null;
  readonly priceFrom: number;
  readonly compareAtFrom: number | null;
  readonly image: ImageUrls | null;
  readonly isFeatured: boolean;
  readonly inStock: boolean;
  readonly lowStock: boolean;
  readonly ratingSummary: RatingSummary;
}

export interface VariantDto {
  readonly id: string;
  readonly label: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly inStock: boolean;
  readonly lowStock: boolean;
  readonly isDefault: boolean;
}

export interface BreadcrumbDto {
  readonly name: string;
  readonly slug: string;
}

export interface ManufacturerDto {
  readonly name: string;
  readonly legalName: string;
  readonly addressLines: readonly string[];
}

export interface ProductDetailDto extends Omit<ProductSummaryDto, 'image'> {
  readonly descriptionHtml: string;
  readonly specifications: Readonly<Record<string, string>>;
  readonly howToUse: string | null;
  readonly tags: readonly string[];
  readonly variants: readonly VariantDto[];
  readonly images: readonly ImageUrls[];
  readonly breadcrumb: readonly BreadcrumbDto[];
  readonly related: readonly ProductSummaryDto[];
  readonly seo: { readonly metaTitle: string | null; readonly metaDescription: string | null };
  readonly hsnCode: string;
  readonly gstRate: number;
  readonly manufacturer: ManufacturerDto;
}

/** Placeholder until reviews (P21) exist. */
export const EMPTY_RATING: RatingSummary = { avg: 0, count: 0 };

export const defaultVariant = (variants: readonly VariantRow[]): VariantRow | undefined =>
  variants.find((variant) => variant.isDefault) ?? variants[0];

const isLow = (variant: VariantRow): boolean =>
  variant.stock > 0 && variant.stock <= variant.lowStockThreshold;

export const stockFlags = (
  variants: readonly VariantRow[],
): { inStock: boolean; lowStock: boolean } => {
  const primary = defaultVariant(variants);
  const inStock = variants.some((variant) => variant.stock > 0);
  return { inStock, lowStock: primary !== undefined && isLow(primary) };
};

export const toVariantDto = (variant: VariantRow): VariantDto => ({
  id: variant.id,
  label: variant.label,
  price: variant.price,
  compareAtPrice: variant.compareAtPrice,
  inStock: variant.stock > 0,
  lowStock: isLow(variant),
  isDefault: variant.isDefault,
});

export const toProductSummary = async (
  row: ProductSummaryRow,
  urls: ImageUrlBuilder,
): Promise<ProductSummaryDto> => {
  const primary = defaultVariant(row.variants);
  const first = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categorySlug: row.category.slug,
    defaultVariantId: primary?.id ?? null,
    priceFrom: primary?.price ?? 0,
    compareAtFrom: primary?.compareAtPrice ?? null,
    image: first === undefined ? null : await urls.imageUrls(first.objectKey, first.alt),
    isFeatured: row.isFeatured,
    ...stockFlags(row.variants),
    ratingSummary: EMPTY_RATING,
  };
};

export const specificationsOf = (value: Prisma.JsonValue): Readonly<Record<string, string>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
};

export const gstRateOf = (value: Prisma.Decimal | number): number =>
  typeof value === 'number' ? value : Number(value.toString());

export interface CategoryNode {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly children: readonly CategoryNode[];
}
