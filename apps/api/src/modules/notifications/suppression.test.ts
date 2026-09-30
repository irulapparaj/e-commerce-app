import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { addSuppression, hashEmail, isSuppressed } from './suppression';

const mockKeys = {
  blindIndex: (v: string) => createHmac('sha256', 'test-key').update(v).digest('hex'),
  encrypt: (v: string) => `v1:enc:${v}`,
  decrypt: (v: string) => v.replace(/^v1:enc:/, ''),
};

const makePrisma = (findResult: { reason: string } | null) => ({
  emailSuppression: {
    findUnique: vi.fn().mockResolvedValue(findResult),
    upsert: vi.fn().mockResolvedValue({}),
  },
});

describe('hashEmail', () => {
  it('returns a 64-char hex string', () => {
    const hash = hashEmail(mockKeys, 'test@example.com');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is case-insensitive', () => {
    expect(hashEmail(mockKeys, 'Test@Example.com')).toBe(hashEmail(mockKeys, 'test@example.com'));
    expect(hashEmail(mockKeys, 'TEST@EXAMPLE.COM')).toBe(hashEmail(mockKeys, 'test@example.com'));
  });

  it('strips leading/trailing whitespace', () => {
    expect(hashEmail(mockKeys, '  test@example.com  ')).toBe(hashEmail(mockKeys, 'test@example.com'));
  });

  it('different addresses produce different hashes', () => {
    expect(hashEmail(mockKeys, 'a@example.com')).not.toBe(hashEmail(mockKeys, 'b@example.com'));
  });
});

describe('isSuppressed', () => {
  it('returns false when no suppression record exists', async () => {
    const prisma = makePrisma(null);
    const result = await isSuppressed({
      prisma: prisma as never,
      emailHash: 'abc123',
      marketing: false,
    });
    expect(result).toBe(false);
  });

  it('returns true for BOUNCE reason', async () => {
    const prisma = makePrisma({ reason: 'BOUNCE' });
    const result = await isSuppressed({
      prisma: prisma as never,
      emailHash: 'abc123',
      marketing: false,
    });
    expect(result).toBe(true);
  });

  it('returns true for COMPLAINT reason', async () => {
    const prisma = makePrisma({ reason: 'COMPLAINT' });
    const result = await isSuppressed({
      prisma: prisma as never,
      emailHash: 'abc123',
      marketing: false,
    });
    expect(result).toBe(true);
  });

  it('returns false for UNSUBSCRIBE on a transactional email', async () => {
    const prisma = makePrisma({ reason: 'UNSUBSCRIBE' });
    const result = await isSuppressed({
      prisma: prisma as never,
      emailHash: 'abc123',
      marketing: false,
    });
    expect(result).toBe(false);
  });

  it('returns true for UNSUBSCRIBE on a marketing email', async () => {
    const prisma = makePrisma({ reason: 'UNSUBSCRIBE' });
    const result = await isSuppressed({
      prisma: prisma as never,
      emailHash: 'abc123',
      marketing: true,
    });
    expect(result).toBe(true);
  });
});

describe('addSuppression', () => {
  it('calls upsert with the email hash and reason', async () => {
    const prisma = makePrisma(null);
    await addSuppression({
      prisma: prisma as never,
      emailHash: 'deadbeef',
      reason: 'BOUNCE',
    });
    expect(prisma.emailSuppression.upsert).toHaveBeenCalledWith({
      where: { emailHash: 'deadbeef' },
      update: { reason: 'BOUNCE' },
      create: { emailHash: 'deadbeef', reason: 'BOUNCE' },
    });
  });
});
