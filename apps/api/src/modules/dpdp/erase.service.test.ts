import { describe, expect, it, vi } from 'vitest';

import { createEraseService } from './erase.service';

const mockKeys = {
  blindIndex: vi.fn().mockImplementation((v: string) => `hash:${v}`),
  encrypt: vi.fn().mockImplementation((v: string) => `v1:enc:${v}`),
  decrypt: vi.fn().mockImplementation((v: string) => v.replace(/^v1:enc:/, '')),
};

const OPTIONS = {
  source: 'ADMIN' as const,
  reason: 'test reason',
  actorId: null,
  ip: null,
  userAgent: null,
};

/** Minimal viable Prisma mock shaped around what eraseCustomer actually calls. */
const makePrismaMock = (userOverride?: Record<string, unknown>) => {
  const user = {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    role: 'CUSTOMER' as const,
    deletedAt: null,
    ...userOverride,
  };

  const txMock = {
    user: { update: vi.fn().mockResolvedValue({}) },
    refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    address: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    wishlistItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    order: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    webhookEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    newsletterSubscriber: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    emailSuppression: { upsert: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };

  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) =>
      fn(txMock),
    ),
    _txMock: txMock,
  } as unknown as Parameters<typeof createEraseService>[0] & { _txMock: typeof txMock };
};

describe('eraseCustomer', () => {
  it('anonymises the user and returns retained/scrubbed counts', async () => {
    const prisma = makePrismaMock();
    const svc = createEraseService(prisma, mockKeys);
    const result = await svc.eraseCustomer('user-uuid-1', OPTIONS);

    expect(result.userId).toBe('user-uuid-1');
    expect(result.retained).toEqual({ orders: 0 });
    expect(result.scrubbed).toEqual({ webhookEvents: 0 });
    expect(result.erasedAt).toBeInstanceOf(Date);
  });

  it('scrubs the newsletter subscription when one exists', async () => {
    const prisma = makePrismaMock();
    const svc = createEraseService(prisma, mockKeys);
    await svc.eraseCustomer('user-uuid-1', OPTIONS);

    expect(prisma._txMock.newsletterSubscriber.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailEncrypted: { set: null } }),
      }),
    );
  });

  it('upserts an email_suppression record with reason UNSUBSCRIBE', async () => {
    const prisma = makePrismaMock();
    const svc = createEraseService(prisma, mockKeys);
    await svc.eraseCustomer('user-uuid-1', OPTIONS);

    expect(prisma._txMock.emailSuppression.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: 'UNSUBSCRIBE' }),
      }),
    );
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const prisma = makePrismaMock();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = createEraseService(prisma, mockKeys);

    await expect(svc.eraseCustomer('missing-id', OPTIONS)).rejects.toThrow('User not found');
  });

  it('throws FORBIDDEN when the user is not a CUSTOMER', async () => {
    const prisma = makePrismaMock({ role: 'ADMIN' });
    const svc = createEraseService(prisma, mockKeys);

    await expect(svc.eraseCustomer('user-uuid-1', OPTIONS)).rejects.toThrow('Only customer accounts');
  });

  it('throws CONFLICT when the user is already erased', async () => {
    const prisma = makePrismaMock({ deletedAt: new Date() });
    const svc = createEraseService(prisma, mockKeys);

    await expect(svc.eraseCustomer('user-uuid-1', OPTIONS)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws ERASE_BLOCKED_ACTIVE_ORDERS when active orders exist', async () => {
    const prisma = makePrismaMock();
    (prisma.order.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    const svc = createEraseService(prisma, mockKeys);

    await expect(svc.eraseCustomer('user-uuid-1', OPTIONS)).rejects.toMatchObject({
      code: 'ERASE_BLOCKED_ACTIVE_ORDERS',
      details: { activeOrders: 2 },
    });
  });
});
