import {
  variantContentPatchSchema,
  variantContentSchema,
  type VariantContentPatch,
  variantPriceSchema,
  type VariantPriceInput,
} from '@pe/shared';
import { z } from 'zod';

import type { AdminVariant } from '@/lib/admin/catalogue-types';
import { toPaise, toRupees } from '@/lib/admin/format';

import type { AdminRole } from '../Nav.config';

/** Inline row state: everything is text until Save, so partial input never throws. */
export interface VariantDraft {
  readonly sku: string;
  readonly label: string;
  readonly weightGrams: string;
  readonly lowStockThreshold: string;
  readonly isDefault: boolean;
  readonly price: string;
  readonly compareAtPrice: string;
}

export type VariantPatch =
  | {
      readonly ok: true;
      readonly content: VariantContentPatch | null;
      readonly price: VariantPriceInput | null;
    }
  | { readonly ok: false; readonly message: string };

const RUPEES_PATTERN = /^\d{1,9}(?:\.\d{1,2})?$/;
const CONTENT_KEYS = ['sku', 'label', 'weightGrams', 'lowStockThreshold', 'isDefault'] as const;

export const rupeesText = (paise: number | null): string =>
  paise === null ? '' : toRupees(paise).toFixed(2);

/** `"199.50"` → 19950; blank or malformed → null. */
export const parseRupees = (text: string): number | null => {
  const trimmed = text.trim();
  return RUPEES_PATTERN.test(trimmed) ? toPaise(Number(trimmed)) : null;
};

export const toDraft = (variant: AdminVariant): VariantDraft => ({
  sku: variant.sku,
  label: variant.label,
  weightGrams: String(variant.weightGrams),
  lowStockThreshold: String(variant.lowStockThreshold),
  isDefault: variant.isDefault,
  price: rupeesText(variant.price),
  compareAtPrice: rupeesText(variant.compareAtPrice),
});

const numberOf = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));

const firstIssue = (error: z.ZodError): string => error.issues[0]?.message ?? 'Invalid value';

const contentChanges = (
  variant: AdminVariant,
  draft: VariantDraft,
): Partial<z.input<typeof variantContentSchema>> => {
  const candidate = {
    sku: draft.sku.trim(),
    label: draft.label.trim(),
    weightGrams: numberOf(draft.weightGrams),
    lowStockThreshold: numberOf(draft.lowStockThreshold),
    isDefault: draft.isDefault,
  };
  return CONTENT_KEYS.reduce<Partial<typeof candidate>>(
    (acc, key) =>
      Object.is(candidate[key], variant[key]) ? acc : { ...acc, [key]: candidate[key] },
    {},
  );
};

const priceChanges = (variant: AdminVariant, draft: VariantDraft): VariantPatch | null => {
  const price = parseRupees(draft.price);
  if (price === null) return { ok: false, message: 'Price must be a rupee amount like 199.00' };
  const compareAtPrice =
    draft.compareAtPrice.trim() === '' ? null : parseRupees(draft.compareAtPrice);
  if (compareAtPrice === null && draft.compareAtPrice.trim() !== '')
    return { ok: false, message: 'Compare-at price must be a rupee amount like 249.00' };
  if (price === variant.price && compareAtPrice === variant.compareAtPrice) return null;
  const parsed = variantPriceSchema.safeParse({ price, compareAtPrice });
  return parsed.success
    ? { ok: true, content: null, price: parsed.data }
    : { ok: false, message: firstIssue(parsed.error) };
};

/** Splits a row edit into the two requests the API expects; STAFF never produces a price patch. */
export const buildVariantPatch = (
  variant: AdminVariant,
  draft: VariantDraft,
  role: AdminRole,
): VariantPatch => {
  const changes = contentChanges(variant, draft);
  let content: VariantContentPatch | null = null;
  if (Object.keys(changes).length > 0) {
    const parsed = variantContentPatchSchema.safeParse(changes);
    if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
    content = parsed.data;
  }
  const price = role === 'ADMIN' ? priceChanges(variant, draft) : null;
  if (price !== null && !price.ok) return price;
  return { ok: true, content, price: price === null ? null : price.price };
};

/** Create dialog: rupee inputs, converted to paise and re-validated on submit. */
export const variantCreateFormSchema = z
  .strictObject({
    ...variantContentSchema.shape,
    price: z.number({ error: 'Enter a price in rupees' }).positive('Price must be above zero'),
    compareAtPrice: z.number().positive('Compare-at price must be above zero').nullable(),
  })
  .refine((value) => value.compareAtPrice === null || value.compareAtPrice > value.price, {
    message: 'Compare-at price must be greater than the price',
    path: ['compareAtPrice'],
  });

export type VariantCreateFormInput = z.input<typeof variantCreateFormSchema>;
export type VariantCreateFormOutput = z.output<typeof variantCreateFormSchema>;

export const toCreateBody = (values: VariantCreateFormOutput) => ({
  sku: values.sku,
  label: values.label,
  weightGrams: values.weightGrams,
  isDefault: values.isDefault,
  lowStockThreshold: values.lowStockThreshold,
  price: toPaise(values.price),
  compareAtPrice: values.compareAtPrice === null ? null : toPaise(values.compareAtPrice),
});

export const replaceVariant = (
  variants: readonly AdminVariant[],
  next: AdminVariant,
): readonly AdminVariant[] =>
  variants.map((entry) =>
    entry.id === next.id ? next : next.isDefault ? { ...entry, isDefault: false } : entry,
  );
