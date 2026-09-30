import {
  EMPTY_RICHTEXT_DOCUMENT,
  isEmptyRichText,
  productCommercialSchema,
  productContentSchema,
  type RichTextDocument,
} from '@pe/shared';
import type { FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import type { AdminCategoryNode, AdminProductDetail } from '@/lib/admin/catalogue-types';

/**
 * Content (STAFF) and commercial (ADMIN ⚡) fields stay separate objects because they are saved by
 * separate routes; `commercial` is absent on create, where the API defaults HSN/GST from the category.
 */
export const productFormSchema = z.strictObject({
  ...productContentSchema.shape,
  commercial: productCommercialSchema.optional(),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormOutput = z.output<typeof productFormSchema>;
export type ProductCommercialValues = NonNullable<ProductFormOutput['commercial']>;

const descriptionOf = (value: RichTextDocument | undefined): RichTextDocument =>
  value === undefined || isEmptyRichText(value) ? EMPTY_RICHTEXT_DOCUMENT : value;

export const toFormValues = (product: AdminProductDetail | null): ProductFormInput => ({
  name: product?.name ?? '',
  sku: product?.sku ?? '',
  categoryId: product?.categoryId ?? '',
  description: descriptionOf(product?.description),
  specifications: product?.specifications ?? {},
  howToUse: product?.howToUse ?? null,
  tags: [...(product?.tags ?? [])],
  ...(product === null
    ? {}
    : {
        commercial: {
          hsnCode: product.hsnCode,
          gstRate: product.gstRate,
          isFeatured: product.isFeatured,
          metaTitle: product.metaTitle,
          metaDescription: product.metaDescription,
        },
      }),
});

export const contentOf = (values: ProductFormOutput): Omit<ProductFormOutput, 'commercial'> => {
  const { commercial: _commercial, ...content } = values;
  return content;
};

/** Only the commercial fields whose value changed; empty when nothing did (the route rejects `{}`). */
export const changedCommercial = (
  before: ProductCommercialValues | undefined,
  after: ProductCommercialValues | undefined,
): Partial<ProductCommercialValues> => {
  if (after === undefined) return {};
  return (Object.keys(after) as (keyof ProductCommercialValues)[]).reduce<
    Partial<ProductCommercialValues>
  >((acc, key) => (before?.[key] === after[key] ? acc : { ...acc, [key]: after[key] }), {});
};

export interface CategoryOption {
  readonly id: string;
  readonly label: string;
  readonly depth: 0 | 1;
}

/** Two-level tree flattened in display order for a `<select>`. */
export const categoryOptions = (tree: readonly AdminCategoryNode[]): readonly CategoryOption[] =>
  tree.flatMap((parent) => [
    { id: parent.id, label: parent.name, depth: 0 as const },
    ...parent.children.map((child) => ({
      id: child.id,
      label: `${parent.name} › ${child.name}`,
      depth: 1 as const,
    })),
  ]);

/** Reads a (possibly nested, dot-separated) field error message from React Hook Form. */
export const fieldError = (errors: FieldErrors, path: string): string | null => {
  const entry = path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, errors);
  if (typeof entry !== 'object' || entry === null || !('message' in entry)) return null;
  const message: unknown = entry.message;
  return typeof message === 'string' ? message : null;
};

export const ADMIN_ONLY_HINT = 'Admin only';
