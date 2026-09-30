import { beforeEach, describe, expect, it } from 'vitest';

import { findOrdersForUser, forUser } from '../../../src/db/scoping';
import { getPrisma, resetDb } from '../../helpers/db';

const order = (userId: string, n: number) => ({
  orderNumber: `PE-2026${String(n).padStart(4, '0')}`,
  userId,
  email: 'x@example.test',
  phone: '9876543210',
  shippingAddress: {},
  destinationState: 'TN',
  subtotal: 100,
  cgstAmount: 3,
  sgstAmount: 2,
  total: 100,
});

describe('forUser scoping', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only the requesting user's orders with a total", async () => {
    const prisma = getPrisma();
    const alice = await prisma.user.create({ data: { email: 'alice@example.test' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.test' } });
    await prisma.order.create({ data: order(alice.id, 1) });
    await prisma.order.create({ data: order(alice.id, 2) });
    await prisma.order.create({ data: order(bob.id, 3) });

    const page = await findOrdersForUser(prisma, alice.id, { page: 1, limit: 1 });
    const none = await findOrdersForUser(prisma, '00000000-0000-0000-0000-000000000000', {
      page: 1,
      limit: 10,
    });

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items.every((o) => o.userId === alice.id)).toBe(true);
    expect(none).toEqual({ items: [], total: 0 });
    expect(forUser(bob.id)).toEqual({
      address: { userId: bob.id },
      order: { userId: bob.id },
      returnRequest: { userId: bob.id },
      wishlistItem: { userId: bob.id },
      refreshToken: { userId: bob.id },
    });
  });
});
