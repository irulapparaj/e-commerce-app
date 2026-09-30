import { ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest, recordAudit } from '../audit/record';
import { currentUser } from '../auth/guards';
import { toPublicUser } from '../auth/refresh.service';
import { createStaffBody } from '../auth/schemas';
import { createStaff } from '../staff/create-staff';
import { createStaffService } from '../staff/staff.service';

import { policyGuards } from './policies';

const staffIdParams = z.strictObject({ id: uuidSchema });
const roleBody = z.strictObject({ role: z.enum(['ADMIN', 'STAFF']) });

/** Staff & roles (P03 task 13 invite + P05 task 3): ADMIN only, every mutation step-up and audited. */
export const staffRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, auth } = app;
  const adminLoginUrl = `${app.env.WEB_ORIGIN}/admin/login`;
  const service = createStaffService({
    prisma,
    refresh: auth.refresh,
    userState: auth.userState,
    email: app.ports.email,
    events: auth.events,
    adminLoginUrl,
    keys: app.ports.keys,
  });
  const read = policyGuards(guards, 'staff.read');
  const write = policyGuards(guards, 'staff.write');

  app.get('/admin/staff', { preHandler: read }, async () => ok(await service.list()));

  app.post(
    '/admin/staff',
    { schema: { body: createStaffBody }, preHandler: write },
    async (request, reply) => {
      const deps = { prisma, email: app.ports.email, events: auth.events, adminLoginUrl, keys: app.ports.keys };
      const user = await createStaff(deps, request.body, currentUser(request).id);
      await recordAudit(prisma, {
        ...actorFromRequest(request),
        action: 'staff.created',
        entityType: 'user',
        entityId: user.id,
        after: { email: user.email, role: user.role },
      });
      return reply.code(201).send(ok({ user }));
    },
  );

  app.post(
    '/admin/staff/:id/role',
    { schema: { params: staffIdParams, body: roleBody }, preHandler: write },
    async (request) =>
      ok({
        user: toPublicUser(
          await service.changeRole(request.params.id, request.body.role, actorFromRequest(request)),
        ),
      }),
  );

  app.post(
    '/admin/staff/:id/mfa-reset',
    { schema: { params: staffIdParams }, preHandler: write },
    async (request) =>
      ok({
        user: toPublicUser(await service.resetMfa(request.params.id, actorFromRequest(request))),
      }),
  );

  app.post(
    '/admin/staff/:id/revoke-sessions',
    { schema: { params: staffIdParams }, preHandler: write },
    async (request) =>
      ok({ revoked: await service.revokeSessions(request.params.id, actorFromRequest(request)) }),
  );
};
