import { z } from 'zod';

import { GST_RATES } from '../constants';
import { richTextDocumentSchema } from '../richtext';

import { uuidSchema } from './common';

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const HSN_PATTERN = /^\d{4}(?:\d{2}|\d{4})?$/;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGES_PER_PRODUCT_MAX = 12;
export const IMAGE_ALT_MAX = 160;
/** Manual stock adjustments above this many units need ADMIN + step-up (DESIGN §8.1). */
export const STEP_UP_ADJUSTMENT_UNITS = 100;

const NAME_MAX = 160;
const LABEL_MAX = 60;
const CATEGORY_NAME_MAX = 80;
const SPEC_KEY_MAX = 60;
const SPEC_VALUE_MAX = 200;
const SPEC_ENTRIES_MAX = 30;
const TAG_MAX = 40;
const TAGS_MAX = 20;
const HOW_TO_USE_MAX = 2000;
const META_TITLE_MAX = 70;
const META_DESCRIPTION_MAX = 160;
const NOTE_MIN = 5;
const NOTE_MAX = 500;
const WEIGHT_MAX_GRAMS = 100_000;
const STOCK_MAX = 100_000;
const PRICE_MAX_PAISE = 1_000_000_000;
const REORDER_MAX = 200;

const nonEmptyPatch = (value: object) => Object.keys(value).length > 0;
const NON_EMPTY_MESSAGE = 'At least one field must be provided';
const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const gstRateSchema = z.union(GST_RATES.map((rate) => z.literal(rate)));
export const hsnCodeSchema = z.string().regex(HSN_PATTERN, 'HSN code must be 4, 6 or 8 digits');
export const skuSchema = z
  .string()
  .trim()
  .regex(SKU_PATTERN, 'SKU may contain letters, digits, dots, hyphens and underscores');

export const specificationsSchema = z
  .record(z.string().trim().min(1).max(SPEC_KEY_MAX), z.string().trim().min(1).max(SPEC_VALUE_MAX))
  .refine((value) => Object.keys(value).length <= SPEC_ENTRIES_MAX, {
    message: `At most ${SPEC_ENTRIES_MAX} specifications`,
  });

export const tagsSchema = z.array(z.string().trim().min(1).max(TAG_MAX)).max(TAGS_MAX);

/** Fields STAFF may edit (§8.1 "Edit content, images, specs"). */
export const productContentSchema = z.strictObject({
  name: z.string().trim().min(1).max(NAME_MAX),
  sku: skuSchema,
  categoryId: uuidSchema,
  description: richTextDocumentSchema,
  specifications: specificationsSchema,
  howToUse: nullableText(HOW_TO_USE_MAX),
  tags: tagsSchema,
});

export const productContentPatchSchema = productContentSchema
  .partial()
  .refine(nonEmptyPatch, NON_EMPTY_MESSAGE);

/** Fields that need ADMIN + step-up: tax classification, featuring and SEO. */
export const productCommercialSchema = z.strictObject({
  hsnCode: hsnCodeSchema,
  gstRate: gstRateSchema,
  isFeatured: z.boolean(),
  metaTitle: nullableText(META_TITLE_MAX),
  metaDescription: nullableText(META_DESCRIPTION_MAX),
});

export const productCommercialPatchSchema = productCommercialSchema
  .partial()
  .refine(nonEmptyPatch, NON_EMPTY_MESSAGE);

export const productPublishSchema = z.strictObject({ isActive: z.boolean() });

export const productCreateSchema = productContentSchema;

export const variantContentSchema = z.strictObject({
  sku: skuSchema,
  label: z.string().trim().min(1).max(LABEL_MAX),
  weightGrams: z.number().int().min(1).max(WEIGHT_MAX_GRAMS),
  isDefault: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(STOCK_MAX),
});

export const variantContentPatchSchema = variantContentSchema
  .partial()
  .refine(nonEmptyPatch, NON_EMPTY_MESSAGE);

const priceShape = {
  price: z.number().int().min(1).max(PRICE_MAX_PAISE),
  compareAtPrice: z.number().int().min(1).max(PRICE_MAX_PAISE).nullable(),
};

const compareAtAbovePrice = (value: { price: number; compareAtPrice: number | null }) =>
  value.compareAtPrice === null || value.compareAtPrice > value.price;
const COMPARE_AT_MESSAGE = 'compareAtPrice must be greater than price';

export const variantPriceSchema = z
  .strictObject(priceShape)
  .refine(compareAtAbovePrice, COMPARE_AT_MESSAGE);

export const variantCreateSchema = z
  .strictObject({ ...variantContentSchema.shape, ...priceShape })
  .refine(compareAtAbovePrice, COMPARE_AT_MESSAGE);

export const categoryInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  parentId: uuidSchema.nullable(),
  metaTitle: nullableText(META_TITLE_MAX),
  metaDescription: nullableText(META_DESCRIPTION_MAX),
});

export const reorderSchema = z.strictObject({
  orderedIds: z.array(uuidSchema).min(1).max(REORDER_MAX),
});

export const imagePresignSchema = z.strictObject({
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  contentLength: z.number().int().min(1).max(IMAGE_MAX_BYTES),
});

export const imageConfirmSchema = z.strictObject({
  key: z.string().min(1).max(200),
  alt: z.string().trim().max(IMAGE_ALT_MAX).default(''),
});

export const imageAltSchema = z.strictObject({ alt: z.string().trim().max(IMAGE_ALT_MAX) });

export const inventoryAdjustSchema = z.strictObject({
  delta: z
    .number()
    .int()
    .min(-STOCK_MAX)
    .max(STOCK_MAX)
    .refine((delta) => delta !== 0, 'delta must not be zero'),
  note: z.string().trim().min(NOTE_MIN).max(NOTE_MAX),
});

export const needsStepUpForAdjustment = (delta: number): boolean =>
  Math.abs(delta) > STEP_UP_ADJUSTMENT_UNITS;

export const isAllowedImageType = (contentType: string): contentType is ImageContentType =>
  (IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType);

export type ProductContentInput = z.infer<typeof productContentSchema>;
export type ProductContentPatch = z.infer<typeof productContentPatchSchema>;
export type ProductCommercialPatch = z.infer<typeof productCommercialPatchSchema>;
export type VariantContentInput = z.infer<typeof variantContentSchema>;
export type VariantContentPatch = z.infer<typeof variantContentPatchSchema>;
export type VariantPriceInput = z.infer<typeof variantPriceSchema>;
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;
