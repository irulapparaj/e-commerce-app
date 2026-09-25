import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EnvKeyProvider } from '../ports/adapters/env-key-provider';
import { isCiphertext } from '../ports/key-provider';

import { decryptResult, encryptData, isPlainData } from './crypto-walk';

const keys = new EnvKeyProvider(randomBytes(32), randomBytes(32));
const PHONE = '9876543210';

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

describe('encryptData', () => {
  it('encrypts declared scalar fields and derives the blind index, ignoring caller-supplied hmac', () => {
    const out = asRecord(
      encryptData(keys, 'User', { email: 'a@b.c', phone: PHONE, phoneHmac: 'bogus' }),
    );

    expect(out.email).toBe('a@b.c');
    expect(isCiphertext(out.phone as string)).toBe(true);
    expect(out.phoneHmac).toBe(keys.blindIndex(PHONE));
  });

  it('handles `{ set }` update syntax and null clears the blind index', () => {
    const set = asRecord(encryptData(keys, 'User', { phone: { set: PHONE } }));
    const cleared = asRecord(encryptData(keys, 'User', { phone: null }));
    const untouched = asRecord(encryptData(keys, 'User', { name: 'x' }));

    expect(isCiphertext((set.phone as { set: string }).set)).toBe(true);
    expect(set.phoneHmac).toBe(keys.blindIndex(PHONE));
    expect(cleared).toEqual({ phone: null, phoneHmac: null });
    expect('phoneHmac' in untouched).toBe(false);
  });

  it('encrypts only declared keys inside JSON columns', () => {
    const out = asRecord(
      encryptData(keys, 'Order', {
        shippingAddress: { line1: 'x', line2: 'y', phone: PHONE, city: 'Chennai' },
      }),
    );
    const address = out.shippingAddress as Record<string, string>;

    expect(isCiphertext(address.line1 ?? '')).toBe(true);
    expect(isCiphertext(address.line2 ?? '')).toBe(true);
    expect(isCiphertext(address.phone ?? '')).toBe(true);
    expect(address.city).toBe('Chennai');
    expect(encryptData(keys, 'Order', { shippingAddress: 'not-an-object' })).toEqual({
      shippingAddress: 'not-an-object',
    });
  });

  it.each([
    ['create', { create: { phone: PHONE, line1: 'a', city: 'c' } }],
    ['create list', { create: [{ phone: PHONE, line1: 'a', city: 'c' }] }],
    ['createMany', { createMany: { data: [{ phone: PHONE, line1: 'a', city: 'c' }] } }],
    ['update data', { update: { phone: PHONE, city: 'c' } }],
    ['update where/data', { update: [{ where: { id: '1' }, data: { phone: PHONE, city: 'c' } }] }],
    ['updateMany', { updateMany: { where: { id: '1' }, data: { line1: 'a', city: 'c' } } }],
    [
      'upsert',
      {
        upsert: {
          where: { id: '1' },
          create: { phone: PHONE, line1: 'a', city: 'c' },
          update: { line1: 'b' },
        },
      },
    ],
    [
      'connectOrCreate',
      { connectOrCreate: { where: { id: '1' }, create: { phone: PHONE, line1: 'a', city: 'c' } } },
    ],
  ])('recurses into nested %s writes on relations', (_label, addresses) => {
    const out = JSON.stringify(encryptData(keys, 'User', { email: 'a@b.c', addresses }));

    expect(out).not.toContain(PHONE);
    expect(out).not.toContain('"line1":"a"');
    expect(out).not.toContain('"line1":"b"');
    expect(out).toContain('"city":"c"');
  });

  it('leaves unknown nested operations, non-object relation values and unknown models alone', () => {
    expect(encryptData(keys, 'User', { addresses: { connect: { id: '1' } } })).toEqual({
      addresses: { connect: { id: '1' } },
    });
    expect(encryptData(keys, 'User', { addresses: 'x' })).toEqual({ addresses: 'x' });
    expect(encryptData(keys, 'Category', { name: 'Agarbatti' })).toEqual({ name: 'Agarbatti' });
    expect(encryptData(keys, 'User', [{ phone: null }])).toEqual([
      { phone: null, phoneHmac: null },
    ]);
    expect(encryptData(keys, 'User', 'scalar')).toBe('scalar');
  });
});

describe('decryptResult', () => {
  it('decrypts declared fields, JSON paths and included relations at any depth', () => {
    const row = {
      id: 'u1',
      phone: keys.encrypt(PHONE),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      addresses: [
        {
          line1: keys.encrypt('12 Temple St'),
          line2: null,
          phone: keys.encrypt(PHONE),
          city: 'Chennai',
        },
      ],
      orders: [
        {
          phone: keys.encrypt(PHONE),
          shippingAddress: { line1: keys.encrypt('x'), city: 'Chennai' },
          items: [{ sku: 's' }],
        },
      ],
      _count: { addresses: 1 },
    };

    const out = decryptResult(keys, 'User', row) as typeof row;

    expect(out.phone).toBe(PHONE);
    expect(out.createdAt).toBeInstanceOf(Date);
    expect(out.addresses[0]?.line1).toBe('12 Temple St');
    expect(out.addresses[0]?.line2).toBeNull();
    expect(out.orders[0]?.phone).toBe(PHONE);
    expect((out.orders[0]?.shippingAddress as { line1: string }).line1).toBe('x');
    expect(out.orders[0]?.items).toEqual([{ sku: 's' }]);
    expect(out._count).toEqual({ addresses: 1 });
    expect(row.phone).not.toBe(PHONE);
  });

  it('passes through scalars, arrays of scalars, plaintext strings and unknown models', () => {
    expect(decryptResult(keys, 'User', 3)).toBe(3);
    expect(decryptResult(keys, 'User', null)).toBeNull();
    expect(decryptResult(keys, 'User', [{ phone: 'plain-legacy' }])).toEqual([
      { phone: 'plain-legacy' },
    ]);
    expect(decryptResult(keys, 'Order', { shippingAddress: null })).toEqual({
      shippingAddress: null,
    });
    expect(decryptResult(keys, 'Category', { name: 'x' })).toEqual({ name: 'x' });
  });
});

describe('isPlainData', () => {
  it('accepts plain objects only', () => {
    expect(isPlainData({})).toBe(true);
    expect(isPlainData([])).toBe(false);
    expect(isPlainData(new Date())).toBe(false);
    expect(isPlainData(Buffer.from('x'))).toBe(false);
    expect(isPlainData(null)).toBe(false);
  });
});
