import {
  formatSpecifications,
  formatTags,
  IMPORT_COLUMNS,
  paiseToRupeesString,
  richTextDocumentSchema,
  richTextToPlainText,
} from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import { gstRateOf, specificationsOf } from '../catalogue/dto';

import { csvDocument } from './csv-safe';

export interface ExportDocument {
  readonly csv: string;
  readonly rows: number;
}

const plainDescription = (value: unknown): string => {
  const parsed = richTextDocumentSchema.safeParse(value);
  return parsed.success ? richTextToPlainText(parsed.data) : '';
};

/**
 * Whole catalogue in the import format (P07 task 8), one row per variant, so a file exported here
 * validates with zero errors when uploaded back. Products without variants have no row.
 */
export const buildProductsExport = async (prisma: PrismaDb): Promise<ExportDocument> => {
  const products = await prisma.product.findMany({
    orderBy: { sku: 'asc' },
    include: { category: { select: { slug: true } }, variants: { orderBy: { sku: 'asc' } } },
  });
  const rows = products.flatMap((product) =>
    product.variants.map((variant) => [
      product.sku,
      product.name,
      product.category.slug,
      plainDescription(product.description),
      product.howToUse ?? '',
      formatSpecifications(specificationsOf(product.specifications)),
      product.hsnCode,
      String(gstRateOf(product.gstRate)),
      formatTags(product.tags),
      String(product.isActive),
      String(product.isFeatured),
      variant.sku,
      variant.label,
      paiseToRupeesString(variant.price),
      variant.compareAtPrice === null ? '' : paiseToRupeesString(variant.compareAtPrice),
      String(variant.stock),
      String(variant.weightGrams),
      String(variant.lowStockThreshold),
      product.metaTitle ?? '',
      product.metaDescription ?? '',
    ]),
  );
  return { csv: csvDocument(IMPORT_COLUMNS, rows), rows: rows.length };
};
