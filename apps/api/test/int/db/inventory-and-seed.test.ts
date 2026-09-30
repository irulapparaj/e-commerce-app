import { AppError } from '@pe/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMovement } from '../../../src/modules/inventory/apply-movement';
import {
  ADMIN_EMAIL,
  getPrisma,
  getPrismaRaw,
  resetDb,
  runSeed,
  seedMinimal,
} from '../../helpers/db';

const ledgerSum = async (variantId: string): Promise<number> => {
  const rows = await getPrismaRaw().$queryRaw<{ sum: number | null }[]>`
    SELECT sum("delta")::int AS sum FROM "stock_movement" WHERE "variant_id" = ${variantId}::uuid`;
  return rows[0]?.sum ?? 0;
};

describe('applyMovement', () => {
  let variantId: string;

  beforeEach(async () => {
    await resetDb();
    const seeded = await seedMinimal(getPrisma());
    variantId = seeded.variantIds[0] ?? '';
  });

  it('reserves stock and writes the ledger row inside the caller transaction', async () => {
    const prisma = getPrisma();
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });

    const result = await prisma.$transaction((tx) =>
      applyMovement({ variantId, delta: -3, reason: 'ORDER_RESERVE', note: 'test' }, tx),
    );
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const movement = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: result.movementId },
    });

    expect(result.stock).toBe(before.stock - 3);
    expect(after.stock).toBe(before.stock - 3);
    expect(movement).toMatchObject({ variantId, delta: -3, reason: 'ORDER_RESERVE', note: 'test' });
    expect(await ledgerSum(variantId)).toBe(after.stock);
  });

  it('rejects over-reservation with INSUFFICIENT_STOCK and leaves stock and ledger unchanged', async () => {
    const prisma = getPrisma();
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const ledgerBefore = await ledgerSum(variantId);

    const attempt = prisma.$transaction((tx) =>
      applyMovement({ variantId, delta: -(before.stock + 1), reason: 'ORDER_RESERVE' }, tx),
    );

    await expect(attempt).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', httpStatus: 409 });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(after.stock).toBe(before.stock);
    expect(await ledgerSum(variantId)).toBe(ledgerBefore);
  });

  it('serialises 20 concurrent reservations of a 10-stock variant into exactly 10 successes', async () => {
    const prisma = getPrisma();
    const current = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    await prisma.$transaction((tx) =>
      applyMovement(
        { variantId, delta: 10 - current.stock, reason: 'ADJUSTMENT', note: 'set to 10' },
        tx,
      ),
    );
    const ledgerBefore = await ledgerSum(variantId);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) =>
          applyMovement({ variantId, delta: -1, reason: 'ORDER_RESERVE' }, tx),
        ),
      ),
    );
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(10);
    expect(after.stock).toBe(0);
    expect((await ledgerSum(variantId)) - ledgerBefore).toBe(-10);
    expect(await ledgerSum(variantId)).toBe(after.stock);
  });

  it('is the ledger source for seeded stock: sum(delta) equals the cached stock for every variant', async () => {
    const variants = await getPrisma().productVariant.findMany();

    for (const variant of variants) expect(await ledgerSum(variant.id)).toBe(variant.stock);
  });
});

describe('seed', () => {
  beforeEach(async () => {
    await resetDb();
  });

  const counts = async () => {
    const prisma = getPrisma();
    return {
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      images: await prisma.productImage.count(),
      movements: await prisma.stockMovement.count(),
      users: await prisma.user.count(),
      settings: await prisma.siteSetting.count(),
    };
  };

  it('loads the taxonomy, 24 products, the admin and settings; running twice leaves identical counts', async () => {
    const prisma = getPrisma();

    const summary = await runSeed(prisma);
    const first = await counts();
    await runSeed(prisma);
    const second = await counts();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const settings = await prisma.siteSetting.findMany({ select: { key: true } });

    expect(summary.products).toBe(24);
    expect(first.categories).toBe(7 + 13 + 12 + 12 + 8 + 4 + 5 + 4);
    expect(first.products).toBe(24);
    expect(first.variants).toBe(27);
    expect(first.images).toBe(24);
    expect(first.settings).toBe(8);
    expect(second).toEqual(first);
    expect(admin).toMatchObject({ role: 'ADMIN', mfaEnabled: false });
    expect(settings.map((s) => s.key).sort()).toEqual([
      'announcement_bar',
      'brand',
      'courier_preferences',
      'free_shipping_threshold',
      'gst_profile',
      'pickup_location',
      'promo_popup',
      'return_window_days',
    ]);
  });

  it('resetDb() empties every table quickly and re-seeding works', async () => {
    const prisma = getPrisma();
    await runSeed(prisma);

    const started = performance.now();
    await resetDb();
    const elapsed = performance.now() - started;
    const emptied = await counts();
    await seedMinimal(prisma);

    expect(Object.values(emptied).every((n) => n === 0)).toBe(true);
    expect(elapsed).toBeLessThan(200);
    expect((await counts()).products).toBe(2);
  });
});
