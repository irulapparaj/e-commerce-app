import { adminApi } from './api';
import type { AdminProductRow } from './catalogue-types';
import { buildQuery } from './query';

export interface ParsedImageName {
  readonly sku: string;
  readonly index: number;
}

/** `SKU-1.jpg`; the SKU may itself contain hyphens, so the last `-n` before the extension wins. */
const NAME_PATTERN = /^(.+)-(\d+)\.(jpe?g|png|webp|avif)$/i;
const LOOKUP_LIMIT = 5;

export const IMAGE_NAME_MESSAGE = 'Name the file SKU-1.jpg, SKU-2.png … so it can be matched';

export const parseImageFilename = (name: string): ParsedImageName | null => {
  const match = NAME_PATTERN.exec(name.trim());
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const index = Number.parseInt(match[2], 10);
  if (!Number.isInteger(index) || index < 1) return null;
  return { sku: match[1], index };
};

/** `GET /admin/products?q=<sku>&limit=5`, keeping only the row whose `sku` equals the name's exactly. */
export const resolveProductBySku = async (sku: string): Promise<AdminProductRow | null> => {
  const { data } = await adminApi.get<readonly AdminProductRow[]>(
    `/admin/products${buildQuery({ q: sku, limit: LOOKUP_LIMIT })}`,
  );
  return data.find((row) => row.sku === sku) ?? null;
};

export const productImagePaths = (productId: string) => ({
  presignPath: `/admin/products/${productId}/images/presign`,
  confirmPath: `/admin/products/${productId}/images/confirm`,
});
