import type { Category } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import { CATEGORY_IMAGE_WIDTH, type ImageUrlBuilder, THUMBNAIL_WIDTH } from '../media/url';

import { gstRateOf, specificationsOf } from './dto';
import type { AdminImageRow, AdminProductRow, AdminVariantRow } from './service-deps';

export interface AdminVariantDto {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly stock: number;
  readonly lowStockThreshold: number;
  readonly weightGrams: number;
  readonly isDefault: boolean;
}

export interface AdminImageDto {
  readonly id: string;
  readonly objectKey: string;
  readonly alt: string;
  readonly sortOrder: number;
  readonly url: string;
  readonly thumbUrl: string;
}

export interface AdminProductRowDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sku: string;
  readonly isActive: boolean;
  readonly isFeatured: boolean;
  readonly category: { readonly id: string; readonly name: string; readonly slug: string };
  readonly variants: readonly Pick<
    AdminVariantDto,
    'id' | 'sku' | 'label' | 'price' | 'stock' | 'lowStockThreshold'
  >[];
  readonly imageCount: number;
  readonly thumbUrl: string | null;
  readonly updatedAt: string;
}

export interface AdminProductDetailDto extends Omit<
  AdminProductRowDto,
  'variants' | 'imageCount' | 'thumbUrl' | 'category'
> {
  readonly description: unknown;
  readonly specifications: Readonly<Record<string, string>>;
  readonly howToUse: string | null;
  readonly categoryId: string;
  readonly hsnCode: string;
  readonly gstRate: number;
  readonly tags: readonly string[];
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly variants: readonly AdminVariantDto[];
  readonly images: readonly AdminImageDto[];
  readonly everOrdered: boolean;
  readonly createdAt: string;
}

export const toAdminVariant = (row: AdminVariantRow): AdminVariantDto => ({
  id: row.id,
  sku: row.sku,
  label: row.label,
  price: row.price,
  compareAtPrice: row.compareAtPrice,
  stock: row.stock,
  lowStockThreshold: row.lowStockThreshold,
  weightGrams: row.weightGrams,
  isDefault: row.isDefault,
});

export const toAdminImage = async (
  row: AdminImageRow,
  urls: ImageUrlBuilder,
): Promise<AdminImageDto> => ({
  id: row.id,
  objectKey: row.objectKey,
  alt: row.alt,
  sortOrder: row.sortOrder,
  url: await urls.url(row.objectKey, CATEGORY_IMAGE_WIDTH, 'webp'),
  thumbUrl: await urls.url(row.objectKey, THUMBNAIL_WIDTH, 'webp'),
});

export const toAdminProductRow = async (
  row: AdminProductRow,
  urls: ImageUrlBuilder,
): Promise<AdminProductRowDto> => {
  const first = row.images[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    category: { id: row.category.id, name: row.category.name, slug: row.category.slug },
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      price: variant.price,
      stock: variant.stock,
      lowStockThreshold: variant.lowStockThreshold,
    })),
    imageCount: row.images.length,
    thumbUrl: first === undefined ? null : await urls.url(first.objectKey, THUMBNAIL_WIDTH, 'webp'),
    updatedAt: row.updatedAt.toISOString(),
  };
};

export const toAdminProductDetail = async (
  row: AdminProductRow,
  urls: ImageUrlBuilder,
  everOrdered: boolean,
): Promise<AdminProductDetailDto> => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  sku: row.sku,
  isActive: row.isActive,
  isFeatured: row.isFeatured,
  description: row.description,
  specifications: specificationsOf(row.specifications),
  howToUse: row.howToUse,
  categoryId: row.categoryId,
  hsnCode: row.hsnCode,
  gstRate: gstRateOf(row.gstRate),
  tags: row.tags,
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
  variants: row.variants.map(toAdminVariant),
  images: await Promise.all(row.images.map((image) => toAdminImage(image, urls))),
  everOrdered,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export interface AdminCategoryNode {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly imageKey: string | null;
  readonly imageUrl: string | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly productCount: number;
  readonly children: readonly AdminCategoryNode[];
}

type CategoryWithCount = Category & { readonly _count: { readonly products: number } };

const toAdminNode = async (
  row: CategoryWithCount,
  children: readonly AdminCategoryNode[],
  urls: ImageUrlBuilder,
): Promise<AdminCategoryNode> => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  parentId: row.parentId,
  sortOrder: row.sortOrder,
  imageKey: row.imageKey,
  imageUrl:
    row.imageKey === null ? null : await urls.url(row.imageKey, CATEGORY_IMAGE_WIDTH, 'webp'),
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
  productCount: row._count.products,
  children,
});

/** Uncached two-level tree with product counts for the admin categories page. */
export const buildAdminCategoryTree = async (
  prisma: Pick<PrismaDb, 'category'>,
  urls: ImageUrlBuilder,
): Promise<readonly AdminCategoryNode[]> => {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  return Promise.all(
    rows
      .filter((row) => row.parentId === null)
      .map(async (root) =>
        toAdminNode(
          root,
          await Promise.all(
            rows.filter((row) => row.parentId === root.id).map((row) => toAdminNode(row, [], urls)),
          ),
          urls,
        ),
      ),
  );
};

export const toAdminCategory = (
  row: Category,
  urls: ImageUrlBuilder,
  productCount = 0,
): Promise<AdminCategoryNode> =>
  toAdminNode({ ...row, _count: { products: productCount } }, [], urls);
