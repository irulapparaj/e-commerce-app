import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REFRESH_TTL } from '../../../src/modules/auth/refresh-state';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { bearer, loginAdmin, loginCustomer, resetValkey } from '../../helpers/auth';
import { ADMIN_EMAIL, getPrisma, resetDb, seedMinimal } from '../../helpers/db';

const refresh = (testApp: TestApp, refreshToken: string) =>
  testApp.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });

describe('refresh token families', () => {
  let testApp: TestApp;
  let clock = new Date('2026-09-25T10:00:00Z');

  beforeAll(async () => {
    testApp = await buildTestApp({ now: () => clock });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    clock = new Date('2026-09-25T10:00:00Z');
    await resetDb();
    await resetValkey(testApp);
  });

  it('rotates a valid token and revokes the whole family when the old one is reused', async () => {
    const prisma = getPrisma();
    const session = await loginCustomer(testApp, 'rotate@example.test');

    const rotated = await refresh(testApp, session.refreshToken);
    const next = rotated.json<{
      data: { accessToken: string; refreshToken: string; csrfToken: string };
    }>().data;
    const reuse = await refresh(testApp, session.refreshToken);
    const nextAfterReuse = await refresh(testApp, next.refreshToken);
    const family = await prisma.refreshToken.findMany({ where: { userId: session.user.id } });

    expect(rotated.statusCode).toBe(200);
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(next.csrfToken).not.toBe(session.csrfToken);
    expect(reuse.statusCode).toBe(401);
    expect(nextAfterReuse.statusCode).toBe(401);
    expect(family).toHaveLength(2);
    expect(family.every((t) => t.revokedAt !== null)).toBe(true);
    expect(new Set(family.map((t) => t.familyId)).size).toBe(1);
  });

  it('keeps the absolute expiry across rotations and stores only hashes', async () => {
    const prisma = getPrisma();
    const session = await loginCustomer(testApp, 'absolute@example.test');
    const first = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: session.user.id },
    });

    clock = new Date(clock.getTime() + 60_000);
    const next = (await refresh(testApp, session.refreshToken)).json<{
      data: { refreshToken: string };
    }>().data;
    const second = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: session.user.id, revokedAt: null },
    });

    expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    expect(second.tokenHash).not.toBe(next.refreshToken);
    expect(second.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.expiresAt.getTime() - first.lastUsedAt.getTime()).toBe(
      REFRESH_TTL.STOREFRONT.absoluteMs,
    );
  });

  it('revokes after 7 days idle for storefront sessions', async () => {
    const session = await loginCustomer(testApp, 'idle@example.test');

    clock = new Date(clock.getTime() + REFRESH_TTL.STOREFRONT.idleMs + 1);
    const res = await refresh(testApp, session.refreshToken);

    expect(res.statusCode).toBe(401);
    expect((await refresh(testApp, session.refreshToken)).statusCode).toBe(401);
  });

  it('logout-all revokes every family and refresh stops working', async () => {
    const a = await loginCustomer(testApp, 'multi@example.test');
    const b = await loginCustomer(testApp, 'multi@example.test');

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: bearer(a.accessToken),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { revoked: number } }>().data.revoked).toBe(2);
    expect((await refresh(testApp, a.refreshToken)).statusCode).toBe(401);
    expect((await refresh(testApp, b.refreshToken)).statusCode).toBe(401);
  });

  it('logout revokes the presented family only', async () => {
    const a = await loginCustomer(testApp, 'single@example.test');
    const b = await loginCustomer(testApp, 'single@example.test');

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: a.refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect((await refresh(testApp, a.refreshToken)).statusCode).toBe(401);
    expect((await refresh(testApp, b.refreshToken)).statusCode).toBe(200);
  });

  it('lists active sessions and revokes one by id', async () => {
    const a = await loginCustomer(testApp, 'sessions@example.test');
    const b = await loginCustomer(testApp, 'sessions@example.test');

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/account/sessions',
      headers: bearer(a.accessToken),
    });
    const sessions = list.json<{ data: { sessions: { id: string; audience: string }[] } }>().data
      .sessions;
    const other = sessions.find((s) => s.id !== a.sessionId);
    const del = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/account/sessions/${other?.id}`,
      headers: bearer(a.accessToken),
    });
    const missing = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/account/sessions/${other?.id}`,
      headers: bearer(a.accessToken),
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.audience === 'STOREFRONT')).toBe(true);
    expect(sessions.map((s) => s.id)).toContain(a.sessionId);
    expect(del.statusCode, del.body).toBe(200);
    expect(missing.statusCode, missing.body).toBe(404);
    expect((await refresh(testApp, b.refreshToken)).statusCode).toBe(401);
    expect((await refresh(testApp, a.refreshToken)).statusCode).toBe(200);
  });

  it('gives admin sessions an 8 hour absolute and 30 minute idle TTL', async () => {
    await seedMinimal(getPrisma());
    const { session } = await loginAdmin(testApp, ADMIN_EMAIL, { at: clock });
    const row = await getPrisma().refreshToken.findFirstOrThrow({
      where: { userId: session.user.id },
    });

    clock = new Date(clock.getTime() + 31 * 60_000);
    const idle = await refresh(testApp, session.refreshToken);

    expect(row.audience).toBe('ADMIN');
    expect(row.expiresAt.getTime() - row.lastUsedAt.getTime()).toBe(REFRESH_TTL.ADMIN.absoluteMs);
    expect(idle.statusCode).toBe(401);
  });
});
