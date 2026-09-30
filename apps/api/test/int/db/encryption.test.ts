import { beforeEach, describe, expect, it } from 'vitest';

import { isCiphertext } from '../../../src/ports/key-provider';
import { getPrisma, getPrismaRaw, getTestKeys, resetDb } from '../../helpers/db';

const PHONE = '9876543210';

describe('Prisma encryption extension', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores ciphertext and a blind index, returns plaintext, and finds users by phoneHmac', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const keys = getTestKeys();

    const created = await prisma.user.create({ data: { email: 'enc@example.test', phone: PHONE } });
    const stored = await raw.user.findUniqueOrThrow({ where: { id: created.id } });
    const found = await prisma.user.findUnique({ where: { id: created.id } });
    const byHmac = await prisma.user.findFirst({ where: { phoneHmac: keys.blindIndex(PHONE) } });

    expect(created.phone).toBe(PHONE);
    expect(stored.phone).not.toBe(PHONE);
    expect(isCiphertext(stored.phone ?? '')).toBe(true);
    expect(stored.phoneHmac).toBe(keys.blindIndex(PHONE));
    expect(found?.phone).toBe(PHONE);
    expect(byHmac?.id).toBe(created.id);
  });

  it('rotates ciphertext and the blind index on update, and clears both on null', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const keys = getTestKeys();
    const user = await prisma.user.create({ data: { email: 'rot@example.test', phone: PHONE } });
    const first = await raw.user.findUniqueOrThrow({ where: { id: user.id } });

    await prisma.user.update({ where: { id: user.id }, data: { phone: '9000000001' } });
    const second = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { phone: { set: '9000000002' } } });
    const third = await raw.user.findUniqueOrThrow({ where: { id: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { phone: null } });
    const cleared = await raw.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(second.phone).not.toBe(first.phone);
    expect(second.phoneHmac).toBe(keys.blindIndex('9000000001'));
    expect(third.phoneHmac).toBe(keys.blindIndex('9000000002'));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBeNull();
    expect(cleared.phone).toBeNull();
    expect(cleared.phoneHmac).toBeNull();
  });

  it('encrypts nested address writes and decrypts included relations', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();

    const user = await prisma.user.create({
      data: {
        email: 'nested@example.test',
        addresses: {
          create: [
            {
              name: 'Home',
              phone: PHONE,
              line1: '12 Temple Street',
              line2: 'Mylapore',
              city: 'Chennai',
              state: 'TN',
              pincode: '600004',
            },
          ],
        },
      },
      include: { addresses: true },
    });
    const storedAddress = await raw.address.findFirstOrThrow({ where: { userId: user.id } });
    const reloaded = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { addresses: true },
    });
    const addresses = await prisma.address.findMany({ where: { userId: user.id } });

    expect(user.addresses[0]?.line1).toBe('12 Temple Street');
    expect(isCiphertext(storedAddress.line1)).toBe(true);
    expect(isCiphertext(storedAddress.line2 ?? '')).toBe(true);
    expect(isCiphertext(storedAddress.phone)).toBe(true);
    expect(storedAddress.city).toBe('Chennai');
    expect(reloaded.addresses[0]?.line2).toBe('Mylapore');
    expect(addresses[0]?.phone).toBe(PHONE);
  });

  it('encrypts only the declared keys inside Order.shippingAddress', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const keys = getTestKeys();
    const user = await prisma.user.create({ data: { email: 'order@example.test' } });

    const order = await prisma.order.create({
      data: {
        orderNumber: 'PE-20260042',
        userId: user.id,
        email: user.email,
        phone: PHONE,
        phoneHmac: 'caller-supplied-value-is-ignored',
        shippingAddress: {
          name: 'Home',
          line1: '12 Temple Street',
          line2: 'Mylapore',
          phone: PHONE,
          city: 'Chennai',
          state: 'TN',
          pincode: '600004',
        },
        destinationState: 'TN',
        subtotal: 8000,
        cgstAmount: 191,
        sgstAmount: 190,
        total: 8000,
      },
    });
    const stored = await raw.order.findUniqueOrThrow({ where: { id: order.id } });
    const storedAddress = stored.shippingAddress as Record<string, string>;
    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const reloadedAddress = reloaded.shippingAddress as Record<string, string>;

    expect(isCiphertext(stored.phone)).toBe(true);
    expect(stored.phoneHmac).toBe(keys.blindIndex(PHONE));
    expect(isCiphertext(storedAddress.line1 ?? '')).toBe(true);
    expect(isCiphertext(storedAddress.line2 ?? '')).toBe(true);
    expect(isCiphertext(storedAddress.phone ?? '')).toBe(true);
    expect(storedAddress.city).toBe('Chennai');
    expect(storedAddress.pincode).toBe('600004');
    expect(reloadedAddress.line1).toBe('12 Temple Street');
    expect(reloadedAddress.phone).toBe(PHONE);
    expect(reloaded.phone).toBe(PHONE);
  });

  it('never returns ciphertext from the extended client for any user read', async () => {
    const prisma = getPrisma();
    await prisma.user.createMany({
      data: [
        { email: 'a@example.test', phone: PHONE },
        { email: 'b@example.test', phone: '9000000009' },
      ],
    });

    const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
    const first = await prisma.user.findFirstOrThrow({ where: { email: 'a@example.test' } });

    expect(users.map((u) => u.phone)).toEqual([PHONE, '9000000009']);
    expect(first.phone).toBe(PHONE);
    expect(users.every((u) => !isCiphertext(u.phone ?? ''))).toBe(true);
  });
});

describe('Prisma encryption extension: nested write operations', () => {
  beforeEach(async () => {
    await resetDb();
  });

  const address = (line1: string) => ({
    name: 'Home',
    phone: PHONE,
    line1,
    city: 'Chennai',
    state: 'TN',
    pincode: '600004',
  });

  it('encrypts through createMany, update, updateMany, upsert and connectOrCreate on relations', async () => {
    const prisma = getPrisma();
    const raw = getPrismaRaw();
    const user = await prisma.user.create({
      data: {
        email: 'nested-ops@example.test',
        addresses: { createMany: { data: [address('A1'), address('A2')] } },
      },
      include: { addresses: { orderBy: { createdAt: 'asc' } } },
    });
    const [first, second] = user.addresses;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        addresses: {
          update: [{ where: { id: first!.id }, data: { line1: 'A1-updated' } }],
          updateMany: { where: { id: second!.id }, data: { line2: 'Floor 2' } },
          upsert: [
            {
              where: { id: '00000000-0000-0000-0000-000000000000' },
              create: address('A3'),
              update: {},
            },
          ],
          connectOrCreate: [
            { where: { id: '00000000-0000-0000-0000-000000000001' }, create: address('A4') },
          ],
        },
      },
    });
    await prisma.address.upsert({
      where: { id: first!.id },
      create: { ...address('never'), userId: user.id },
      update: { phone: '9000000005' },
    });

    const stored = await raw.address.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    const plain = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(stored).toHaveLength(4);
    expect(stored.every((a) => isCiphertext(a.line1) && isCiphertext(a.phone))).toBe(true);
    expect(isCiphertext(stored[1]?.line2 ?? '')).toBe(true);
    expect(plain.map((a) => a.line1)).toEqual(['A1-updated', 'A2', 'A3', 'A4']);
    expect(plain[0]?.phone).toBe('9000000005');
    expect(plain[1]?.line2).toBe('Floor 2');
  });
});
