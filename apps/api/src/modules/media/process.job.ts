import { AppError, IMAGE_MAX_BYTES } from '@pe/shared';
import { fileTypeFromBuffer } from 'file-type';

import type { PrismaDb } from '../../db/prisma';
import type { MediaProcessPayload } from '../../jobs/queue';
import type { ObjectStoragePort } from '../../ports/object-storage';
import { recordAudit, SYSTEM_ACTOR } from '../audit/record';
import type { RevalidateNotifier } from '../revalidate/notify';
import { tagsForCategory, tagsForProduct } from '../revalidate/tags';

import { isAcceptedDetection, typeForExtension } from './allowed-types';
import { buildDerivatives, type Derivative, inspectImage } from './derivatives';
import { DERIVATIVE_FORMATS, DERIVATIVE_WIDTHS, derivativeKey } from './url';

const HEAD_BYTES = 4_100;
const MAX_READ_BYTES = IMAGE_MAX_BYTES + 1;

export interface MediaProcessDeps {
  readonly prisma: PrismaDb;
  readonly storage: ObjectStoragePort;
  readonly bucket: string;
  readonly revalidate: RevalidateNotifier;
  readonly log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void };
}

export interface MediaProcessResult {
  readonly base: string;
  readonly imageId: string | null;
  readonly derivatives: number;
  readonly width: number;
  readonly height: number;
}

const readAll = async (stream: NodeJS.ReadableStream, limit: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new AppError('VALIDATION', 'Upload exceeds the size limit');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const extensionOf = (key: string): string => key.slice(key.lastIndexOf('.') + 1);
const baseOf = (key: string): string => key.slice(0, key.lastIndexOf('.'));

/** Rejects anything whose magic bytes disagree with the key's extension (spoofed PDFs, SVG, HTML). */
const verifyMagicBytes = async (key: string, bytes: Buffer): Promise<void> => {
  const detected = await fileTypeFromBuffer(bytes.subarray(0, HEAD_BYTES));
  const declared = typeForExtension(extensionOf(key));
  if (!isAcceptedDetection(detected) || declared === undefined || detected?.mime !== declared) {
    throw new AppError(
      'VALIDATION',
      `Rejected upload: content is ${detected?.mime ?? 'unrecognised'}`,
    );
  }
};

const uploadDerivatives = async (
  deps: MediaProcessDeps,
  base: string,
  derivatives: readonly Derivative[],
): Promise<void> => {
  await Promise.all(
    derivatives.map((derivative) =>
      deps.storage.put({
        bucket: deps.bucket,
        key: derivativeKey(base, derivative.width, derivative.format),
        body: derivative.body,
        contentType: derivative.contentType,
      }),
    ),
  );
};

const attachToTarget = async (
  deps: MediaProcessDeps,
  payload: MediaProcessPayload,
  base: string,
): Promise<string | null> => {
  const { target } = payload;
  if (target.kind === 'product') {
    return deps.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: target.productId },
        select: {
          slug: true,
          isFeatured: true,
          category: { select: { slug: true, parent: { select: { slug: true } } } },
          _count: { select: { images: true } },
        },
      });
      if (product === null) throw new AppError('NOT_FOUND', 'Product no longer exists');
      const image = await tx.productImage.create({
        data: {
          productId: target.productId,
          objectKey: base,
          alt: target.alt,
          sortOrder: product._count.images,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        ...SYSTEM_ACTOR,
        action: 'image.added',
        entityType: 'product',
        entityId: target.productId,
        after: { imageId: image.id, objectKey: base },
      });
      await deps.revalidate.notify(
        tagsForProduct({
          slug: product.slug,
          categorySlug: product.category.slug,
          parentCategorySlug: product.category.parent?.slug,
          isFeatured: product.isFeatured,
        }),
      );
      return image.id;
    });
  }
  return deps.prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id: target.categoryId },
      data: { imageKey: base },
      select: { slug: true, parent: { select: { slug: true } } },
    });
    await recordAudit(tx, {
      ...SYSTEM_ACTOR,
      action: 'category.image_set',
      entityType: 'category',
      entityId: target.categoryId,
      after: { objectKey: base },
    });
    await deps.revalidate.notify(tagsForCategory(category.slug, category.parent?.slug));
    return null;
  });
};

const reject = async (
  deps: MediaProcessDeps,
  payload: MediaProcessPayload,
  reason: string,
): Promise<never> => {
  await deps.storage.delete({ bucket: deps.bucket, key: payload.key });
  await recordAudit(deps.prisma, {
    ...SYSTEM_ACTOR,
    action: 'media.rejected',
    entityType: 'media',
    entityId: payload.key,
    after: { reason, target: payload.target },
  });
  deps.log.warn({ key: payload.key, reason }, 'media upload rejected');
  throw new AppError('VALIDATION', reason);
};

/**
 * `media-process` job (P04 task 8): magic-byte check → decode → EXIF-rotate + strip → derivatives →
 * upload → delete the original → attach to the product/category → revalidate.
 */
export const processMedia = async (
  deps: MediaProcessDeps,
  payload: MediaProcessPayload,
): Promise<MediaProcessResult> => {
  const head = await deps.storage.head({ bucket: deps.bucket, key: payload.key });
  if (!head.exists) throw new AppError('NOT_FOUND', 'Uploaded object not found');
  const bytes = await readAll(
    await deps.storage.getStream({ bucket: deps.bucket, key: payload.key }),
    MAX_READ_BYTES,
  );
  try {
    await verifyMagicBytes(payload.key, bytes);
  } catch (error) {
    return reject(deps, payload, error instanceof Error ? error.message : 'Rejected upload');
  }
  let info: Awaited<ReturnType<typeof inspectImage>>;
  let derivatives: readonly Derivative[];
  try {
    info = await inspectImage(bytes);
    derivatives = await buildDerivatives(bytes);
  } catch {
    return reject(deps, payload, 'Rejected upload: not a decodable image');
  }
  const base = baseOf(payload.key);
  await uploadDerivatives(deps, base, derivatives);
  await deps.storage.delete({ bucket: deps.bucket, key: payload.key });
  const imageId = await attachToTarget(deps, payload, base);
  deps.log.info({ key: payload.key, base, derivatives: derivatives.length }, 'media processed');
  return { base, imageId, derivatives: derivatives.length, width: info.width, height: info.height };
};

/** Best-effort removal of every derivative of a base key (used when images/products are deleted). */
export const deleteDerivatives = async (
  storage: ObjectStoragePort,
  bucket: string,
  base: string,
  log?: { warn(obj: object, msg: string): void },
): Promise<void> => {
  await Promise.all(
    DERIVATIVE_WIDTHS.flatMap((width) =>
      DERIVATIVE_FORMATS.map((format) => {
        const key = derivativeKey(base, width, format);
        return storage.delete({ bucket, key }).catch((err: unknown): void => {
          log?.warn({ err, key }, 'deleteDerivatives: failed to delete S3 object');
        });
      }),
    ),
  );
};
