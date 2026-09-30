import type { PrismaDb } from '../../db/prisma';
import type { ImageUrlBuilder } from '../media/url';

import { PRODUCT_SUMMARY_INCLUDE, type ProductSummaryDto, toProductSummary } from './dto';

export const RELATED_LIMIT = 8;

/** Same category, featured first then newest, active only, never the product itself (P04 task 4). */
export const findRelatedProducts = async (
  prisma: PrismaDb,
  product: { readonly id: string; readonly categoryId: string },
  urls: ImageUrlBuilder,
): Promise<readonly ProductSummaryDto[]> => {
  const rows = await prisma.product.findMany({
    where: { categoryId: product.categoryId, isActive: true, id: { not: product.id } },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: RELATED_LIMIT,
    include: PRODUCT_SUMMARY_INCLUDE,
  });
  return Promise.all(rows.map((row) => toProductSummary(row, urls)));
};
