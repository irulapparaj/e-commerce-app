import { describe, expect, it, vi } from 'vitest';

import type { PrismaRaw } from '../../db/prisma';

import { normaliseQuery, PostgresSearchAdapter } from './postgres-search';

interface Captured {
  readonly text: string;
  readonly values: readonly unknown[];
}

const fakeRaw = (rows: unknown[] = []) => {
  const calls: Captured[] = [];
  const fakeTx = {
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values });
      return rows;
    }),
  };
  const raw = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values });
      return rows;
    }),
    $transaction: vi.fn(async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx)),
  } as unknown as PrismaRaw;
  return { raw, calls };
};

describe('normaliseQuery', () => {
  it('trims, collapses whitespace and caps at 100 characters', () => {
    expect(normaliseQuery('  pure   camphor ')).toBe('pure camphor');
    expect(normaliseQuery('x'.repeat(150))).toHaveLength(100);
    expect(normaliseQuery('\t\n')).toBe('');
  });
});

describe('PostgresSearchAdapter', () => {
  it('binds the query as a value so search syntax injection stays literal', async () => {
    const { raw, calls } = fakeRaw();
    const adapter = new PostgresSearchAdapter(raw, { similarityThreshold: 0.25 });

    await adapter.search({ q: "' OR 1=1 --", limit: 5 });

    expect(calls).toHaveLength(2);
    const [products, categories] = calls as [Captured, Captured];
    expect(products.text).not.toContain("' OR 1=1");
    expect(products.values).toContain("' OR 1=1 --");
    // threshold is now set via SET LOCAL in $executeRaw, not embedded in $queryRaw values
    expect(products.values).toContain(5);
    expect(products.text).toContain('websearch_to_tsquery');
    expect(products.text).toContain('similarity');
    expect(products.text).toContain('"is_active" = true');
    expect(categories.values).toContain("%' OR 1=1 --%");
  });

  it('escapes ILIKE wildcards in the category pattern', async () => {
    const { raw, calls } = fakeRaw();

    await new PostgresSearchAdapter(raw).search({ q: '50%_off', type: 'category', limit: 3 });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.values).toContain('%50\\%\\_off%');
  });

  it('skips the database for blank queries and clamps the limit', async () => {
    const { raw, calls } = fakeRaw();
    const adapter = new PostgresSearchAdapter(raw);

    expect(await adapter.search({ q: '   ', limit: 10 })).toEqual({ products: [], categories: [] });
    expect(calls).toHaveLength(0);
    await adapter.search({ q: 'kapur', type: 'product', limit: 500 });
    expect(calls[0]!.values).toContain(50);
  });

  it('index and remove are no-ops for the generated column', async () => {
    const { raw } = fakeRaw();
    const adapter = new PostgresSearchAdapter(raw);

    await expect(
      adapter.indexProduct({
        id: 'x',
        slug: 'x',
        name: 'x',
        sku: 'x',
        tags: [],
        categoryName: 'c',
        isActive: true,
      }),
    ).resolves.toBeUndefined();
    await expect(adapter.removeProduct('x')).resolves.toBeUndefined();
  });
});
