import { describe, expect, it, vi } from 'vitest';

import type { KeyProvider } from '../../../ports/key-provider';

import { listOrders } from './list.query';

// Minimal KeyProvider stub
const makeKeys = (hashFn: (v: string) => string): KeyProvider => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  blindIndex: hashFn,
});

// Minimal PrismaDb stub that records the where clause passed to findMany
const makePrisma = () => {
  const capturedWhere: unknown[] = [];
  const prisma = {
    order: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        capturedWhere.push(where);
        return Promise.resolve([]);
      }),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { prisma: prisma as unknown as Parameters<typeof listOrders>[0], capturedWhere };
};

describe('listOrders phone search', () => {
  it('uses HMAC equality (blind index) instead of startsWith for phone queries', async () => {
    const phoneInput = '9876543210';
    const expectedHmac = 'abc123hmacvalue';
    const keys = makeKeys(() => expectedHmac);
    const { prisma, capturedWhere } = makePrisma();

    await listOrders(prisma, keys, { q: phoneInput });

    expect(capturedWhere).toHaveLength(1);
    const where = capturedWhere[0] as {
      OR?: Array<{ phoneHmac?: unknown }>;
    };
    expect(where.OR).toBeDefined();

    // Should contain exact HMAC equality, not a startsWith object
    const phoneCondition = where.OR?.find(
      (c) => c.phoneHmac !== undefined,
    );
    expect(phoneCondition).toBeDefined();
    expect(phoneCondition?.phoneHmac).toBe(expectedHmac);
    // Explicitly verify it is NOT a { startsWith: ... } object
    expect(typeof phoneCondition?.phoneHmac).toBe('string');
  });

  it('does not use HMAC lookup for non-phone search terms', async () => {
    const keys = makeKeys(vi.fn(() => 'hmac'));
    const { prisma, capturedWhere } = makePrisma();

    await listOrders(prisma, keys, { q: 'PE-1234' });

    const where = capturedWhere[0] as { OR?: Array<{ phoneHmac?: unknown }> };
    const phoneCondition = where.OR?.find((c) => c.phoneHmac !== undefined);
    expect(phoneCondition).toBeUndefined();
  });

  it('blindIndex is called with the raw phone number', async () => {
    const blindIndex = vi.fn(() => 'the_hmac');
    const keys = makeKeys(blindIndex);
    const { prisma } = makePrisma();

    await listOrders(prisma, keys, { q: '9876543210' });

    expect(blindIndex).toHaveBeenCalledWith('9876543210');
  });
});
