import { AppError } from '@pe/shared';

import { recordAudit } from '../audit/record';
import { deleteDerivatives } from '../media/process.job';

import {
  ADMIN_PRODUCT_INCLUDE,
  type AdminImageRow,
  type CatalogueServiceDeps,
  productTags,
  type ServiceContext,
} from './service-deps';

export interface ImageService {
  reorder(
    productId: string,
    orderedIds: readonly string[],
    ctx: ServiceContext,
  ): Promise<readonly AdminImageRow[]>;
  updateAlt(
    productId: string,
    imageId: string,
    alt: string,
    ctx: ServiceContext,
  ): Promise<AdminImageRow>;
  remove(productId: string, imageId: string, ctx: ServiceContext): Promise<void>;
}

/** Image metadata writes (P04 task 7). Adding an image happens in the media job after processing. */
export const createImageService = (deps: CatalogueServiceDeps): ImageService => {
  const { prisma, revalidate } = deps;

  const loadProduct = async (productId: string) => {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: ADMIN_PRODUCT_INCLUDE,
    });
    if (product === null) throw new AppError('NOT_FOUND', 'Product not found');
    return product;
  };

  const reorder: ImageService['reorder'] = async (productId, orderedIds, ctx) => {
    const product = await loadProduct(productId);
    const current = product.images.map((image) => image.id);
    const same =
      current.length === orderedIds.length &&
      current.every((id) => orderedIds.includes(id)) &&
      new Set(orderedIds).size === orderedIds.length;
    if (!same)
      throw new AppError(
        'VALIDATION',
        'orderedIds must list every image of the product exactly once',
      );
    const images = await prisma.$transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          tx.productImage.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'image.reordered',
        entityType: 'product',
        entityId: productId,
        before: { order: current },
        after: { order: [...orderedIds] },
      });
      return tx.productImage.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' } });
    });
    await revalidate.notify(productTags(product));
    return images;
  };

  const updateAlt: ImageService['updateAlt'] = async (productId, imageId, alt, ctx) => {
    const product = await loadProduct(productId);
    const before = product.images.find((image) => image.id === imageId);
    if (before === undefined) throw new AppError('NOT_FOUND', 'Image not found');
    const after = await prisma.$transaction(async (tx) => {
      const row = await tx.productImage.update({ where: { id: imageId }, data: { alt } });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'image.updated',
        entityType: 'product',
        entityId: productId,
        before: { imageId, alt: before.alt },
        after: { imageId, alt },
      });
      return row;
    });
    await revalidate.notify(productTags(product));
    return after;
  };

  const remove: ImageService['remove'] = async (productId, imageId, ctx) => {
    const product = await loadProduct(productId);
    const image = product.images.find((candidate) => candidate.id === imageId);
    if (image === undefined) throw new AppError('NOT_FOUND', 'Image not found');
    await prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      const remaining = product.images.filter((candidate) => candidate.id !== imageId);
      await Promise.all(
        remaining.map((candidate, index) =>
          tx.productImage.update({ where: { id: candidate.id }, data: { sortOrder: index } }),
        ),
      );
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'image.deleted',
        entityType: 'product',
        entityId: productId,
        before: { imageId, objectKey: image.objectKey, alt: image.alt },
      });
    });
    await deleteDerivatives(deps.storage, deps.bucket, image.objectKey);
    await revalidate.notify(productTags(product));
  };

  return { reorder, updateAlt, remove };
};
