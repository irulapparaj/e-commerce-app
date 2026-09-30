import { AppError, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest, recordAudit } from '../audit/record';

import { policyGuards } from './policies';

const sessionParams = z.strictObject({ id: uuidSchema });

export interface SecurityOverview {
  readonly adminSessions: readonly {
    readonly id: string;
    readonly user: { readonly id: string; readonly email: string; readonly role: string };
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly lastUsedAt: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }[];
  readonly failedLogins24h: number;
  readonly mfaFailures24h: number;
  readonly webhookFailures24h: {
    readonly RAZORPAY: number;
    readonly SHIPROCKET: number;
    readonly EMAIL: number;
  };
  readonly ledgerDrift24h: number;
  /** Staff who hit the 30/day PII reveal limit (P08 task 4). */
  readonly piiRevealLimited24h: number;
  /** Payment reconciliation arrives in P25. */
  readonly reconciliationMismatches: null;
}

/** P05 task 5: security & health overview plus admin session revocation. */
export const securityRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, counters, auth } = app;

  app.get('/admin/security', { preHandler: policyGuards(guards, 'security.read') }, async () => {
    const now = new Date();
    const [
      sessions,
      failedLogins24h,
      mfaFailures24h,
      razorpay,
      shiprocket,
      email,
      ledgerDrift24h,
      piiRevealLimited24h,
    ] = await Promise.all([
      prisma.refreshToken.findMany({
        where: { audience: 'ADMIN', revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
        include: { user: { select: { id: true, email: true, role: true } } },
      }),
      counters.count24h('auth.otp.failed'),
      counters.count24h('auth.mfa.failed'),
      counters.count24h('webhook.signature.invalid.RAZORPAY'),
      counters.count24h('webhook.signature.invalid.SHIPROCKET'),
      counters.count24h('webhook.signature.invalid.EMAIL'),
      counters.count24h('inventory.ledger.drift'),
      counters.count24h('customer.pii.reveal.limited'),
    ]);
    const overview: SecurityOverview = {
      adminSessions: sessions.map((session) => ({
        id: session.id,
        user: session.user,
        ip: session.ip,
        userAgent: session.userAgent,
        lastUsedAt: session.lastUsedAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
      failedLogins24h,
      mfaFailures24h,
      webhookFailures24h: { RAZORPAY: razorpay, SHIPROCKET: shiprocket, EMAIL: email },
      ledgerDrift24h,
      piiRevealLimited24h,
      reconciliationMismatches: null,
    };
    return ok(overview);
  });

  app.post(
    '/admin/security/sessions/:id/revoke',
    { schema: { params: sessionParams }, preHandler: policyGuards(guards, 'security.write') },
    async (request) => {
      const session = await prisma.refreshToken.findFirst({
        where: { id: request.params.id, audience: 'ADMIN' },
        select: { userId: true },
      });
      if (session === null) throw new AppError('NOT_FOUND', 'Session not found');
      const revoked = await auth.refresh.revokeSession(session.userId, request.params.id);
      await recordAudit(prisma, {
        ...actorFromRequest(request),
        action: 'security.session_revoked',
        entityType: 'session',
        entityId: request.params.id,
        after: { userId: session.userId, revoked },
      });
      auth.events.record('auth.session.revoked', {
        userId: session.userId,
        sessionId: request.params.id,
        actorId: request.user?.id,
      });
      return ok({ revoked });
    },
  );
};
