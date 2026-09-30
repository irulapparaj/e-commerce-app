import { fail, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { currentUser } from './guards';
import { sessionIdParams } from './schemas';

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  mfaEnabled: true,
  locale: true,
  createdAt: true,
} as const;

/** Current user and session management for both storefront and admin audiences. */
export const sessionRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { auth, guards } = app;
  const anySession = [guards.authenticate(['storefront', 'admin'])];

  app.get('/auth/me', { preHandler: anySession }, async (request) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: currentUser(request).id },
      select: ME_SELECT,
    });
    return ok({ user, audience: currentUser(request).aud });
  });

  app.get('/account/sessions', { preHandler: anySession }, async (request) =>
    ok({ sessions: await auth.refresh.listSessions(currentUser(request).id) }),
  );

  app.delete(
    '/account/sessions/:id',
    { schema: { params: sessionIdParams }, preHandler: anySession },
    async (request, reply) => {
      const revoked = await auth.refresh.revokeSession(currentUser(request).id, request.params.id);
      if (!revoked)
        return reply.code(404).send(fail({ code: 'NOT_FOUND', message: 'Session not found' }));
      return ok({ revoked: true });
    },
  );
};
