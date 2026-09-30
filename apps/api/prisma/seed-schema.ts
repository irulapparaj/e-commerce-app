import { GST_RATES, rupeesToPaise, slugSchema } from '@pe/shared';
import { z } from 'zod';

const paiseFromRupees = z.string().transform((value) => rupeesToPaise(value) as number);

export const categorySeedSchema = z.strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  sortOrder: z.number().int().min(0),
  children: z.array(z.string().min(1)).min(1),
});

export const variantSeedSchema = z.strictObject({
  sku: z.string().min(1),
  label: z.string().min(1),
  price: paiseFromRupees,
  compareAtPrice: paiseFromRupees.optional(),
  stock: z.number().int().min(0),
  weightGrams: z.number().int().positive(),
  isDefault: z.boolean().default(false),
});

export const productSeedSchema = z.strictObject({
  sku: z.string().min(1),
  name: z.string().min(1),
  /** `<top-level-slug>/<child-slug>` */
  category: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  tags: z.array(z.string()).default([]),
  isFeatured: z.boolean().default(false),
  hsnCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  gstRate: z
    .union(
      GST_RATES.map((rate) => z.literal(rate)) as [
        z.ZodLiteral<5>,
        z.ZodLiteral<12>,
        z.ZodLiteral<18>,
      ],
    )
    .optional(),
  specifications: z.record(z.string(), z.string()).default({}),
  description: z.string().optional(),
  variants: z.array(variantSeedSchema).min(1).max(2),
});

export const categoriesSeedSchema = z.array(categorySeedSchema);
export const productsSeedSchema = z.array(productSeedSchema);

export type CategorySeed = z.infer<typeof categorySeedSchema>;
export type ProductSeed = z.infer<typeof productSeedSchema>;
