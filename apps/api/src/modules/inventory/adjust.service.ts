import type { PrismaDb } from '../../db/prisma';
import { type AuditActor, recordAudit } from '../audit/record';
import type { RevalidateNotifier } from '../revalidate/notify';
import { tagsForProduct } from '../revalidate/tags';

import { applyMovement, type MovementResult } from './apply-movement';

export interface AdjustInput {
  readonly variantId: string;
  readonly delta: number;
  readonly note: string;
}

export interface AdjustService {
  adjust(input: AdjustInput, actor: AuditActor): Promise<MovementResult>;
}

export interface AdjustServiceDeps {
  readonly prisma: PrismaDb;
  readonly revalidate: RevalidateNotifier;
}

/**
 * Manual stock adjustment (P06 task 5): a delta with a reason through `applyMovement` in one
 * transaction with the audit row. No absolute-stock setter exists on purpose (review note).
 */
export const createAdjustService = ({ prisma, revalidate }: AdjustServiceDeps): AdjustService => ({
  adjust: async (input, actor) => {
    const result = await prisma.$transaction(async (tx) => {
      const movement = await applyMovement(
        {
          variantId: input.variantId,
          delta: input.delta,
          reason: 'ADJUSTMENT',
          note: input.note,
          ...(actor.actorId === null ? {} : { actorId: actor.actorId }),
        },
        tx,
      );
      await recordAudit(tx, {
        ...actor,
        action: 'inventory.adjusted',
        entityType: 'variant',
        entityId: input.variantId,
        before: { stock: movement.stock - input.delta },
        after: {
          stock: movement.stock,
          delta: input.delta,
          note: input.note,
          movementId: movement.movementId,
        },
      });
      return movement;
    });
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      select: {
        product: {
          select: {
            slug: true,
            isFeatured: true,
            category: { select: { slug: true, parent: { select: { slug: true } } } },
          },
        },
      },
    });
    if (variant !== null) {
      await revalidate.notify(
        tagsForProduct({
          slug: variant.product.slug,
          categorySlug: variant.product.category.slug,
          parentCategorySlug: variant.product.category.parent?.slug,
          isFeatured: variant.product.isFeatured,
        }),
      );
    }
    return result;
  },
});
