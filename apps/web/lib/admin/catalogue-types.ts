import type { RichTextDocument } from '@pe/shared';

/** Response shapes from the P06 admin API (scratchpad/admin-api-contracts.md, "P06 — catalogue & inventory"). */

export type GstRate = 5 | 12 | 18;

export interface AdminVariant {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  /** Integer paise. */
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly stock: number;
  readonly lowStockThreshold: number;
  readonly weightGrams: number;
  readonly isDefault: boolean;
}

export interface AdminImage {
  readonly id: string;
  readonly objectKey: string;
  readonly alt: string;
  readonly sortOrder: number;
  /** 640 px webp. */
  readonly url: string;
  /** 320 px webp. */
  readonly thumbUrl: string;
}

export type AdminProductRowVariant = Pick<
  AdminVariant,
  'id' | 'sku' | 'label' | 'price' | 'stock' | 'lowStockThreshold'
>;

export interface AdminProductRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sku: string;
  readonly isActive: boolean;
  readonly isFeatured: boolean;
  readonly category: { readonly id: string; readonly name: string; readonly slug: string };
  readonly variants: readonly AdminProductRowVariant[];
  readonly imageCount: number;
  readonly thumbUrl: string | null;
  readonly updatedAt: string;
}

export interface AdminProductDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sku: string;
  readonly description: RichTextDocument;
  readonly specifications: Readonly<Record<string, string>>;
  readonly howToUse: string | null;
  readonly categoryId: string;
  readonly hsnCode: string;
  readonly gstRate: GstRate;
  readonly tags: readonly string[];
  readonly isActive: boolean;
  readonly isFeatured: boolean;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly variants: readonly AdminVariant[];
  readonly images: readonly AdminImage[];
  readonly everOrdered: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

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

export interface StockRow {
  readonly variantId: string;
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly label: string;
  readonly stock: number;
  readonly lowStockThreshold: number;
  readonly isLow: boolean;
  readonly lastMovementAt: string | null;
}

export const STOCK_REASONS = [
  'ORDER_RESERVE',
  'ORDER_RELEASE',
  'SALE',
  'RETURN_RESTOCK',
  'ADJUSTMENT',
  'IMPORT',
] as const;

export type StockReason = (typeof STOCK_REASONS)[number];

export interface MovementRow {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productName: string;
  readonly label: string;
  readonly delta: number;
  readonly reason: StockReason;
  readonly referenceId: string | null;
  readonly actor: { readonly id: string; readonly email: string } | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export type JobState = 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';

export interface JobStatus {
  readonly id: string;
  readonly name: string;
  readonly state: JobState;
  readonly error: string | null;
  readonly output: unknown;
}

export interface PresignedUpload {
  readonly url: string;
  readonly key: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface AdjustResult {
  readonly stock: number;
  readonly movementId: string;
}
