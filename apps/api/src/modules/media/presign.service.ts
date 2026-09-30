import { randomUUID } from 'node:crypto';

import {
  AppError,
  IMAGE_MAX_BYTES,
  IMAGES_PER_PRODUCT_MAX,
  type ImageContentType,
} from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';
import type { JobQueue, MediaTarget } from '../../jobs/queue';
import type { ObjectStoragePort } from '../../ports/object-storage';

import { extensionFor } from './allowed-types';

export const PRESIGN_TTL_SECONDS = 300;
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PRODUCT_KEY_PATTERN = new RegExp(
  `^products/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(jpg|png|webp|avif)$`,
);
const CATEGORY_KEY_PATTERN = new RegExp(
  `^categories/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(jpg|png|webp|avif)$`,
);

export interface PresignInput {
  readonly contentType: ImageContentType;
  readonly contentLength: number;
}

export interface PresignedImageUpload {
  readonly url: string;
  readonly key: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface MediaPresignDeps {
  readonly prisma: Pick<PrismaDb, 'product' | 'category' | 'productImage'>;
  readonly storage: ObjectStoragePort;
  readonly bucket: string;
  readonly jobs: JobQueue;
  readonly now?: () => Date;
}

export interface MediaPresignService {
  presignProductImage(
    input: PresignInput & { readonly productId: string },
  ): Promise<PresignedImageUpload>;
  presignCategoryImage(
    input: PresignInput & { readonly categoryId: string },
  ): Promise<PresignedImageUpload>;
  /** Verifies the object exists under the target's prefix and enqueues `media-process`. */
  confirmUpload(key: string, target: MediaTarget): Promise<{ jobId: string }>;
}

/** Keys are always server-generated (`products/{productId}/{uuid}.{ext}`); client names never appear. */
export const createMediaPresignService = (deps: MediaPresignDeps): MediaPresignService => {
  const now = deps.now ?? (() => new Date());

  const presign = async (key: string, input: PresignInput): Promise<PresignedImageUpload> => {
    if (input.contentLength < 1 || input.contentLength > IMAGE_MAX_BYTES) {
      throw new AppError('VALIDATION', `Image must be between 1 byte and ${IMAGE_MAX_BYTES} bytes`);
    }
    const upload = await deps.storage.presignPut({
      bucket: deps.bucket,
      key,
      contentType: input.contentType,
      sizeBytes: input.contentLength,
      maxBytes: IMAGE_MAX_BYTES,
      expiresSec: PRESIGN_TTL_SECONDS,
    });
    const expiresAt = new Date(now().getTime() + PRESIGN_TTL_SECONDS * 1000).toISOString();
    return { url: upload.url, key, headers: upload.headers, expiresAt };
  };

  const presignProductImage: MediaPresignService['presignProductImage'] = async (input) => {
    const product = await deps.prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (product === null) throw new AppError('NOT_FOUND', 'Product not found');
    if (product._count.images >= IMAGES_PER_PRODUCT_MAX) {
      throw new AppError('CONFLICT', `A product can have at most ${IMAGES_PER_PRODUCT_MAX} images`);
    }
    const key = `products/${product.id}/${randomUUID()}.${extensionFor(input.contentType)}`;
    return presign(key, input);
  };

  const presignCategoryImage: MediaPresignService['presignCategoryImage'] = async (input) => {
    const category = await deps.prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (category === null) throw new AppError('NOT_FOUND', 'Category not found');
    const key = `categories/${category.id}/${randomUUID()}.${extensionFor(input.contentType)}`;
    return presign(key, input);
  };

  const keyMatchesTarget = (key: string, target: MediaTarget): boolean => {
    const match = (target.kind === 'product' ? PRODUCT_KEY_PATTERN : CATEGORY_KEY_PATTERN).exec(
      key,
    );
    if (match === null) return false;
    return match[1] === (target.kind === 'product' ? target.productId : target.categoryId);
  };

  const confirmUpload: MediaPresignService['confirmUpload'] = async (key, target) => {
    if (!keyMatchesTarget(key, target))
      throw new AppError('VALIDATION', 'Upload key does not belong to this target');
    const head = await deps.storage.head({ bucket: deps.bucket, key });
    if (!head.exists)
      throw new AppError('NOT_FOUND', 'Upload not found; complete the PUT before confirming');
    const jobId = await deps.jobs.send('media-process', { key, target });
    if (jobId === null) throw new AppError('INTERNAL', 'Could not enqueue media processing');
    return { jobId };
  };

  return { presignProductImage, presignCategoryImage, confirmUpload };
};
