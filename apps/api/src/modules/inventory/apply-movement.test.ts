import { AppError } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { applyMovement, type MovementTx } from './apply-movement';

const fakeTx = (): MovementTx =>
  ({
    $queryRaw: async () => [],
    stockMovement: { create: async () => ({ id: 'm' }) },
    productVariant: { update: async () => ({ id: 'v' }) },
  }) as unknown as MovementTx;

describe('applyMovement input validation', () => {
  it.each([0, 1.5, Number.NaN])(
    'rejects a delta of %s before touching the database',
    async (delta) => {
      await expect(
        applyMovement(
          { variantId: '0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d', delta, reason: 'ADJUSTMENT' },
          fakeTx(),
        ),
      ).rejects.toThrow(AppError);
    },
  );

  it('reports NOT_FOUND when the variant row does not exist', async () => {
    await expect(
      applyMovement(
        { variantId: '0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d', delta: 1, reason: 'ADJUSTMENT' },
        fakeTx(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
