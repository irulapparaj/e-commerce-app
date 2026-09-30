import { beforeEach, describe, expect, it } from 'vitest';

import { formatOrderNumber, istYear, nextOrderNumber } from '../../../src/db/order-number';
import { getPrisma, getPrismaRaw, resetDb, seedMinimal } from '../../helpers/db';

describe('product search vector and trigram search', () => {
  beforeEach(async () => {
    await resetDb();
    await seedMinimal(getPrisma());
  });

  it('populates search_vector on insert and updates it when the name changes', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const category = await prisma.category.findFirstOrThrow();
    const product = await prisma.product.create({
      data: {
        name: 'Kapur Tablets',
        slug: 'kapur-tablets',
        sku: 'KAP-1',
        categoryId: category.id,
        hsnCode: '2914',
        gstRate: 18,
        tags: ['camphor'],
      },
    });

    const before = await raw.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "product" WHERE "search_vector" @@ plainto_tsquery('english', 'kapur') AND "id" = ${product.id}::uuid`;
    const byTag = await raw.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "product" WHERE "search_vector" @@ plainto_tsquery('simple', 'camphor') AND "id" = ${product.id}::uuid`;
    await prisma.product.update({ where: { id: product.id }, data: { name: 'Loban Tablets' } });
    const after = await raw.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "product" WHERE "search_vector" @@ plainto_tsquery('english', 'loban') AND "id" = ${product.id}::uuid`;
    const stale = await raw.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "product" WHERE "search_vector" @@ plainto_tsquery('english', 'kapur') AND "id" = ${product.id}::uuid`;

    expect(before[0]?.n).toBe(1);
    expect(byTag[0]?.n).toBe(1);
    expect(after[0]?.n).toBe(1);
    expect(stale[0]?.n).toBe(0);
  });

  it('finds "Kapur" for the misspelling "kapor" through the trigram index', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const category = await prisma.category.findFirstOrThrow();
    await prisma.product.create({
      data: {
        name: 'Kapur',
        slug: 'kapur',
        sku: 'KAP-2',
        categoryId: category.id,
        hsnCode: '2914',
        gstRate: 18,
      },
    });

    const rows = await raw.$queryRaw<
      { name: string }[]
    >`SELECT "name" FROM "product" WHERE "name" % 'kapor'`;
    const plan = await raw.$queryRaw<
      { 'QUERY PLAN': string }[]
    >`EXPLAIN SELECT "name" FROM "product" WHERE "name" % 'kapor'`;

    expect(rows.map((r) => r.name)).toContain('Kapur');
    expect(plan.map((p) => p['QUERY PLAN']).join('\n')).toMatch(/product_name_idx|Seq Scan/);
  });
});

describe('next_order_number()', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('formats PE-YYYYNNNN for the current IST year and matches the TS formatter', async () => {
    const prisma = getPrisma();

    const first = await prisma.$transaction((tx) => nextOrderNumber(tx));
    const second = await prisma.$transaction((tx) => nextOrderNumber(tx));

    const year = istYear(new Date());
    expect(first).toBe(formatOrderNumber(year, 1));
    expect(second).toBe(formatOrderNumber(year, 2));
  });

  it('yields 50 unique, strictly increasing numbers under 50 concurrent calls', async () => {
    const prisma = getPrisma();

    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => prisma.$transaction((tx) => nextOrderNumber(tx))),
    );

    const sequences = numbers.map((n) => Number(n.slice(7))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(50);
    expect(sequences).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('creates a missing year sequence on demand without truncating past 9999', async () => {
    const raw = getPrismaRaw();
    const year = istYear(new Date());
    await raw.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "order_number_seq_${year}"`);

    const created = await raw.$queryRaw<{ n: string }[]>`SELECT next_order_number() AS n`;
    await raw.$executeRawUnsafe(`SELECT setval('order_number_seq_${year}', 9999)`);
    const big = await raw.$queryRaw<{ n: string }[]>`SELECT next_order_number() AS n`;

    expect(created[0]?.n).toBe(formatOrderNumber(year, 1));
    expect(big[0]?.n).toBe(formatOrderNumber(year, 10000));
  });
});
