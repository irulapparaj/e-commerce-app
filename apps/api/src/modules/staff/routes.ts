import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { currentUser } from '../auth/guards';
import { createStaffBody } from '../auth/schemas';

import { createStaff } from './create-staff';

export const staffRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards } = app;
  const adminLoginUrl = `${app.env.WEB_ORIGIN}/admin/login`;

  app.post(
    '/admin/staff',
    {
      schema: { body: createStaffBody },
      preHandler: [
        guards.authenticate('admin'),
        guards.requireRole('ADMIN'),
        guards.requireMfaEnrolled(),
        guards.requireStepUp(),
      ],
    },
    async (request, reply) => {
      const deps = {
        prisma: app.prisma,
        email: app.ports.email,
        events: app.auth.events,
        adminLoginUrl,
      };
      const user = await createStaff(deps, request.body, currentUser(request).id);
      return reply.code(201).send(ok({ user }));
    },
  );
};
