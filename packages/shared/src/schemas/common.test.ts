import { describe, expect, it } from 'vitest';

import {
  emailSchema,
  paginationSchema,
  phoneSchema,
  pincodeSchema,
  quantitySchema,
  slugSchema,
  stateCodeSchema,
  uuidSchema,
} from './common';

describe('pincodeSchema', () => {
  it.each(['600001', '110001'])('accepts %s', (v) =>
    expect(pincodeSchema.safeParse(v).success).toBe(true),
  );
  it.each(['60000', '6000011', 'ABCDEF', ''])('rejects %j', (v) =>
    expect(pincodeSchema.safeParse(v).success).toBe(false),
  );
});

describe('phoneSchema', () => {
  it.each(['9876543210', '6000000000'])('accepts %s', (v) =>
    expect(phoneSchema.safeParse(v).success).toBe(true),
  );
  it.each(['5876543210', '987654321', '+919876543210', ''])('rejects %j', (v) =>
    expect(phoneSchema.safeParse(v).success).toBe(false),
  );
});

describe('slugSchema', () => {
  it.each(['agarbatti', 'royale-masala-2'])('accepts %s', (v) =>
    expect(slugSchema.safeParse(v).success).toBe(true),
  );
  it.each(['Agarbatti', 'has space', 'a'.repeat(121), ''])('rejects %j', (v) =>
    expect(slugSchema.safeParse(v).success).toBe(false),
  );
});

describe('emailSchema', () => {
  it('normalises case and whitespace', () => {
    expect(emailSchema.parse('  Admin@Example.TEST ')).toBe('admin@example.test');
  });
  it.each(['not-an-email', 'a@', '', `${'a'.repeat(250)}@x.io`])('rejects %j', (v) =>
    expect(emailSchema.safeParse(v).success).toBe(false),
  );
});

describe('quantitySchema', () => {
  it.each([1, 20])('accepts %d', (v) => expect(quantitySchema.safeParse(v).success).toBe(true));
  it.each([0, 21, 1.5, -1])('rejects %d', (v) =>
    expect(quantitySchema.safeParse(v).success).toBe(false),
  );
});

describe('uuidSchema and stateCodeSchema', () => {
  it('validates uuid and state code', () => {
    expect(uuidSchema.safeParse('0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d').success).toBe(true);
    expect(uuidSchema.safeParse('nope').success).toBe(false);
    expect(stateCodeSchema.safeParse('TN').success).toBe(true);
    expect(stateCodeSchema.safeParse('ZZ').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('applies defaults and coerces strings', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationSchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(paginationSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});
