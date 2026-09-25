import { AppError } from '@pe/shared';
import type { StockReason } from '@prisma/client';

import type { PrismaTx } from '../../db/prisma';

export interface MovementInput {
  readonly variantId: string;
  readonly delta: number;
  readonly reason: StockReason;
  readonly referenceId?: string;
  readonly actorId?: string;
  readonly note?: string;
}

export interface MovementResult {
  readonly movementId: string;
  readonly stock: number;
}

export type MovementTx = Pick<PrismaTx, '$queryRaw' | 'stockMovement' | 'productVariant'>;

interface LockedVariant {
  readonly id: string;
  readonly stock: number;
}

/**
 * The only code path allowed to change `product_variant.stock` (R7). Runs inside the caller's
 * transaction: locks the variant row, rejects negative stock, appends the ledger row, then
 * refreshes the cached stock.
 */
export const applyMovement = async (
  input: MovementInput,
  tx: MovementTx,
): Promise<MovementResult> => {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new AppError('VALIDATION', 'Stock delta must be a non-zero integer');
  }
  const rows = await tx.$queryRaw<LockedVariant[]>`
    SELECT "id", "stock" FROM "product_variant" WHERE "id" = ${input.variantId}::uuid FOR UPDATE`;
  const variant = rows[0];
  if (variant === undefined) throw new AppError('NOT_FOUND', 'Variant not found');

  const stock = variant.stock + input.delta;
  if (stock < 0) {
    throw new AppError('INSUFFICIENT_STOCK', undefined, {
      details: { variantId: input.variantId, available: variant.stock, requested: -input.delta },
    });
  }

  const movement = await tx.stockMovement.create({
    data: {
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
    },
    select: { id: true },
  });
  await tx.productVariant.update({
    where: { id: input.variantId },
    data: { stock },
    select: { id: true },
  });
  return { movementId: movement.id, stock };
};
