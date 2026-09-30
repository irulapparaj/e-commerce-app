import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createProduct } from '../../helpers/catalogue';
import { getPrisma, getPrismaRaw, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs, revalidateTagsEnqueued } from '../../helpers/jobs';

interface StockRow {
  readonly variantId: string;
  readonly sku: string;
  readonly stock: number;
  readonly isLow: boolean;
  readonly lastMovementAt: string | null;
}

describe('admin inventory routes', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;
  let categoryId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    categoryId = (await seedMinimal(getPrisma())).categoryId;
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  it('adjusts stock through the ledger with an audit row, refuses negative results and requires step-up above 100 units', async () => {
    const product = await createProduct(testApp, { name: 'Adjustable', categoryId, stock: 10 });
    const variantId = product.variants[0]!.id;
    await resetJobs();

    const minusFive = await adminInject(
      testApp,
      staff.token,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: -5, note: 'damaged in storage' },
    );
    const tooMany = await adminInject(
      testApp,
      staff.token,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: -6, note: 'would go negative' },
    );
    const largeStaff = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: 150, note: 'big restock' },
    );
    const largeNoStepUp = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: 150, note: 'big restock' },
    );
    const large = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: 150, note: 'big restock' },
    );
    const shortNote = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: 1, note: 'abc' },
    );
    const zero = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/inventory/${variantId}/adjust`,
      { delta: 0, note: 'nothing here' },
    );
    const movements = await getPrisma().stockMovement.findMany({
      where: { variantId, reason: 'ADJUSTMENT' },
      orderBy: { createdAt: 'asc' },
    });
    const audits = await getPrisma().auditLog.findMany({
      where: { action: 'inventory.adjusted' },
      orderBy: { createdAt: 'asc' },
    });

    expect(minusFive.statusCode).toBe(200);
    expect(body<{ stock: number; movementId: string }>(minusFive).data.stock).toBe(5);
    expect(tooMany.statusCode).toBe(409);
    expect(body(tooMany).error?.code).toBe('INSUFFICIENT_STOCK');
    expect(largeStaff.statusCode).toBe(403);
    expect(body(largeStaff).error?.code).toBe('FORBIDDEN');
    expect(largeNoStepUp.statusCode).toBe(403);
    expect(body(largeNoStepUp).error?.code).toBe('STEP_UP_REQUIRED');
    expect(large.statusCode).toBe(200);
    expect(body<{ stock: number }>(large).data.stock).toBe(155);
    expect(shortNote.statusCode).toBe(400);
    expect(zero.statusCode).toBe(400);
    expect(movements.map((m) => [m.delta, m.actorId, m.note])).toEqual([
      [-5, staff.userId, 'damaged in storage'],
      [150, admin.userId, 'big restock'],
    ]);
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      actorId: staff.userId,
      before: { stock: 10 },
      after: expect.objectContaining({ stock: 5, delta: -5 }),
    });
    expect((await revalidateTagsEnqueued()).length).toBe(2);
  });

  it('serialises 20 concurrent -1 adjustments on stock 10 into exactly 10 successes', async () => {
    const product = await createProduct(testApp, { name: 'Contended', categoryId, stock: 10 });
    const variantId = product.variants[0]!.id;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        adminInject(
          testApp,
          i % 2 === 0 ? staff.token : admin.token,
          'POST',
          `/admin/inventory/${variantId}/adjust`,
          { delta: -1, note: `concurrent ${i}` },
        ),
      ),
    );
    const variant = await getPrisma().productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    const ledger = await getPrismaRaw().$queryRaw<
      { sum: number }[]
    >`SELECT sum("delta")::int AS sum FROM "stock_movement" WHERE "variant_id" = ${variantId}::uuid`;

    expect(results.filter((res) => res.statusCode === 200)).toHaveLength(10);
    expect(results.filter((res) => res.statusCode === 409)).toHaveLength(10);
    expect(variant.stock).toBe(0);
    expect(ledger[0]?.sum).toBe(0);
  });

  it('lists stock with search, category and below-threshold filters, low-stock and the movement ledger', async () => {
    const low = await createProduct(testApp, { name: 'Nearly out', categoryId, stock: 2 });
    const fine = await createProduct(testApp, { name: 'Plenty', categoryId, stock: 50 });
    await adminInject(
      testApp,
      staff.token,
      'POST',
      `/admin/inventory/${low.variants[0]!.id}/adjust`,
      { delta: 1, note: 'found one' },
    );

    const all = body<StockRow[]>(
      await adminInject(testApp, staff.token, 'GET', '/admin/inventory?limit=50'),
    ).data;
    const below = body<StockRow[]>(
      await adminInject(testApp, staff.token, 'GET', '/admin/inventory?belowThreshold=true'),
    ).data;
    const search = body<StockRow[]>(
      await adminInject(testApp, staff.token, 'GET', '/admin/inventory?q=plenty'),
    ).data;
    const byCategory = await adminInject(
      testApp,
      staff.token,
      'GET',
      `/admin/inventory?category=${categoryId}`,
    );
    const lowStock = body<StockRow[]>(
      await adminInject(testApp, staff.token, 'GET', '/admin/inventory/low-stock'),
    ).data;
    const ledger = body<
      { delta: number; reason: string; actor: { email: string } | null; sku: string }[]
    >(
      await adminInject(
        testApp,
        staff.token,
        'GET',
        `/admin/inventory/movements?variantId=${low.variants[0]!.id}`,
      ),
    ).data;
    const byReason = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/inventory/movements?reason=ADJUSTMENT',
    );
    const badReason = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/inventory/movements?reason=MAGIC',
    );

    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.find((row) => row.variantId === low.variants[0]!.id)).toMatchObject({
      stock: 3,
      isLow: true,
    });
    expect(all.find((row) => row.variantId === low.variants[0]!.id)?.lastMovementAt).not.toBeNull();
    expect(below.every((row) => row.isLow)).toBe(true);
    expect(below.map((row) => row.variantId)).toContain(low.variants[0]!.id);
    expect(below.map((row) => row.variantId)).not.toContain(fine.variants[0]!.id);
    expect(search.map((row) => row.variantId)).toEqual([fine.variants[0]!.id]);
    expect(body(byCategory).meta?.total).toBeGreaterThanOrEqual(2);
    expect(lowStock.map((row) => row.variantId)).toContain(low.variants[0]!.id);
    expect(ledger.map((row) => [row.delta, row.reason])).toEqual([
      [1, 'ADJUSTMENT'],
      [2, 'IMPORT'],
    ]);
    expect(ledger[0]?.actor?.email).toBe(staff.email);
    expect(body(byReason).meta?.total).toBe(1);
    expect(badReason.statusCode).toBe(400);
  });

  it('ledger-check reports drift injected with raw SQL, increments the security counter and never auto-heals', async () => {
    const product = await createProduct(testApp, { name: 'Drifting', categoryId, stock: 7 });
    const variantId = product.variants[0]!.id;
    await getPrismaRaw()
      .$executeRaw`UPDATE "product_variant" SET "stock" = 9 WHERE "id" = ${variantId}::uuid`;

    const asStaff = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      '/admin/inventory/ledger-check',
    );
    const res = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      '/admin/inventory/ledger-check',
    );
    const result = body<{
      checked: number;
      drift: { variantId: string; stock: number; ledger: number; difference: number }[];
    }>(res).data;
    const security = body<{ ledgerDrift24h: number }>(
      await adminInject(testApp, admin.token, 'GET', '/admin/security'),
    ).data;
    const variant = await getPrisma().productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    const audit = await getPrisma().auditLog.findFirst({
      where: { action: 'inventory.ledger_check' },
    });

    expect(asStaff.statusCode).toBe(403);
    expect(res.statusCode).toBe(200);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.drift).toEqual([
      { variantId, sku: product.variants[0]!.sku, stock: 9, ledger: 7, difference: 2 },
    ]);
    expect(security.ledgerDrift24h).toBe(1);
    expect(variant.stock).toBe(9);
    expect(audit).toMatchObject({
      actorId: admin.userId,
      after: expect.objectContaining({ trigger: 'manual', checked: result.checked }),
    });
  });
});
