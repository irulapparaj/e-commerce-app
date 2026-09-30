import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { actorFromRequest, type AuditTx, recordAudit, redactAudit, SYSTEM_ACTOR } from './record';

describe('redactAudit', () => {
  it('drops PII and secret keys at any depth, case-insensitively, and keeps everything else', () => {
    const input = {
      name: 'A',
      phone: '9876543210',
      Phone: 'x',
      address: {
        line1: '1 Street',
        line2: 'Nagar',
        city: 'Chennai',
        nested: { totpSecret: 's', keep: 1 },
      },
      list: [{ refreshToken: 'r', ok: true }, 'plain'],
      mfaRecoveryCodes: ['a'],
      tokenHash: 'h',
    };

    expect(redactAudit(input)).toEqual({
      name: 'A',
      address: { city: 'Chennai', nested: { keep: 1 } },
      list: [{ ok: true }, 'plain'],
    });
  });

  it('truncates runaway nesting', () => {
    const deep = Array.from({ length: 20 }).reduce<unknown>((acc) => ({ next: acc }), 'end');

    expect(JSON.stringify(redactAudit(deep))).toContain('[TRUNCATED]');
  });
});

describe('recordAudit', () => {
  const captureTx = () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'audit-1',
      ...data,
    }));
    return { tx: { auditLog: { create } } as unknown as AuditTx, create };
  };

  it('serialises dates and decimals, redacts, and writes nulls explicitly', async () => {
    const { tx, create } = captureTx();

    const result = await recordAudit(tx, {
      ...SYSTEM_ACTOR,
      action: 'variant.price_updated',
      entityType: 'variant',
      entityId: 'v1',
      before: {
        price: 100,
        gstRate: new Prisma.Decimal('5.00'),
        at: new Date('2026-01-01T00:00:00Z'),
        phone: 'x',
      },
      after: null,
    });

    expect(result.id).toBe('audit-1');
    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      actorId: null,
      action: 'variant.price_updated',
      entityType: 'variant',
      entityId: 'v1',
      ip: null,
      userAgent: null,
    });
    expect(data.before).toEqual({ price: 100, gstRate: '5', at: '2026-01-01T00:00:00.000Z' });
    expect(data.after).toBe(Prisma.JsonNull);
  });

  it('omits before/after when not supplied', async () => {
    const { tx, create } = captureTx();

    await recordAudit(tx, {
      actorId: 'u1',
      ip: '1.1.1.1',
      userAgent: 'ua',
      action: 'x',
      entityType: 'y',
    });

    const data = create.mock.calls[0]![0].data;
    expect('before' in data).toBe(false);
    expect('after' in data).toBe(false);
    expect(data.entityId).toBeNull();
  });

  it('builds the actor from a request', () => {
    const request = {
      user: { id: 'u1' },
      ip: '10.0.0.1',
      headers: { 'user-agent': 'vitest' },
    } as never;
    const anonymous = { ip: '10.0.0.2', headers: {} } as never;

    expect(actorFromRequest(request)).toEqual({
      actorId: 'u1',
      ip: '10.0.0.1',
      userAgent: 'vitest',
    });
    expect(actorFromRequest(anonymous)).toEqual({ actorId: null, ip: '10.0.0.2', userAgent: null });
  });
});
