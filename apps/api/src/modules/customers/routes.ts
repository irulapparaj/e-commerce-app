import { AppError, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { policyGuards } from '../admin/policies';
import { actorFromRequest, recordAudit } from '../audit/record';
import { currentUser } from '../auth/guards';
import { eraseUser } from '../dpdp/erase.service';

import { createCustomerService } from './disable.service';
import { createRevealService } from './reveal.service';
import { listCustomers } from './search';

export const REVEAL_TOKEN_HEADER = 'x-reveal-token';
const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;
const REASON_MIN = 10;
const REASON_MAX = 500;

const searchQuery = z.strictObject({
  q: z.string().trim().max(254).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
});
const idParams = z.strictObject({ id: uuidSchema });
const sessionParams = z.strictObject({ id: uuidSchema, sessionId: uuidSchema });
export const reasonBody = z.strictObject({
  reason: z.string().trim().min(REASON_MIN).max(REASON_MAX),
});

/** P08 tasks 2–7: masked by default, reveal behind step-up + reason, DPDP actions audited. */
export const customerRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, auth } = app;
  const customers = createCustomerService({
    prisma,
    refresh: auth.refresh,
    userState: auth.userState,
    events: auth.events,
  });
  const reveal = createRevealService({
    prisma,
    tokens: auth.tokens,
    rateLimiter: app.rateLimiter,
    counters: app.counters,
    events: auth.events,
    ttlSeconds: app.env.PII_REVEAL_TTL_SECONDS ?? 300,
  });
  const read = policyGuards(guards, 'customers.read');

  app.get(
    '/admin/customers',
    { schema: { querystring: searchQuery }, preHandler: read },
    async (request) => {
      const { page, limit, q } = request.query;
      const result = await listCustomers(prisma, app.ports.keys, { q, page, limit });
      return ok(result.rows, { page, limit, total: result.total });
    },
  );

  app.get(
    '/admin/customers/:id',
    { schema: { params: idParams }, preHandler: read },
    async (request) => ok(await customers.detail(request.params.id)),
  );

  app.get(
    '/admin/customers/:id/sessions',
    { schema: { params: idParams }, preHandler: read },
    async (request) => {
      await customers.detail(request.params.id);
      const sessions = await auth.refresh.listSessions(request.params.id);
      return ok(
        sessions.map((session) => ({
          id: session.id,
          audience: session.audience,
          ip: session.ip,
          userAgent: session.userAgent,
          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        })),
      );
    },
  );

  app.post(
    '/admin/customers/:id/sessions/:sessionId/revoke',
    {
      schema: { params: sessionParams },
      preHandler: policyGuards(guards, 'customers.sessions_revoke'),
    },
    async (request) =>
      ok({
        revoked: await customers.revokeSession(
          request.params.id,
          request.params.sessionId,
          actorFromRequest(request),
        ),
      }),
  );

  app.post(
    '/admin/customers/:id/reveal',
    {
      schema: { params: idParams, body: reasonBody },
      preHandler: policyGuards(guards, 'customers.reveal'),
    },
    async (request) =>
      ok(await reveal.issue(request.params.id, request.body.reason, actorFromRequest(request))),
  );

  app.get(
    '/admin/customers/:id/pii',
    { schema: { params: idParams }, preHandler: policyGuards(guards, 'customers.pii') },
    async (request) => {
      const header = request.headers[REVEAL_TOKEN_HEADER];
      const token = Array.isArray(header) ? header[0] : header;
      if (token === undefined || token === '') throw new AppError('REVEAL_EXPIRED');
      return ok(await reveal.read(request.params.id, token, actorFromRequest(request)));
    },
  );

  app.post(
    '/admin/customers/:id/disable',
    {
      schema: { params: idParams, body: reasonBody },
      preHandler: policyGuards(guards, 'customers.disable'),
    },
    async (request) =>
      ok({
        customer: await customers.disable(
          request.params.id,
          request.body.reason,
          actorFromRequest(request),
        ),
      }),
  );

  app.post(
    '/admin/customers/:id/enable',
    { schema: { params: idParams }, preHandler: policyGuards(guards, 'customers.enable') },
    async (request) =>
      ok({ customer: await customers.enable(request.params.id, actorFromRequest(request)) }),
  );

  app.post(
    '/admin/customers/:id/dpdp-export',
    { schema: { params: idParams }, preHandler: policyGuards(guards, 'customers.dpdp_export') },
    async (request, reply) => {
      await customers.detail(request.params.id);
      const jobId = await app.jobs.send('dpdp-export', {
        userId: request.params.id,
        requestedBy: 'ADMIN',
        actorId: currentUser(request).id,
      });
      if (jobId === null) throw new AppError('INTERNAL', 'Could not enqueue the export');
      await recordAudit(prisma, {
        ...actorFromRequest(request),
        action: 'customer.dpdp_export_requested',
        entityType: 'user',
        entityId: request.params.id,
        after: { jobId },
      });
      return reply.code(202).send(ok({ jobId }));
    },
  );

  app.post(
    '/admin/customers/:id/dpdp-erase',
    {
      schema: { params: idParams, body: reasonBody },
      preHandler: policyGuards(guards, 'customers.erase'),
    },
    async (request) =>
      ok(
        await eraseUser(
          { prisma, userState: auth.userState, events: auth.events, keys: app.ports.keys },
          request.params.id,
          { actor: actorFromRequest(request), source: 'ADMIN', reason: request.body.reason },
        ),
      ),
  );
};
