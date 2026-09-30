import { AppError, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { REAUTH_AMR, currentUser } from '../auth/guards';
import { eraseUser } from '../dpdp/erase.service';

import { updateProfile } from './profile.service';

const EXPORT_RATE_KEY = (userId: string): string => `account:export:${userId}`;
const EXPORT_RATE_WINDOW_SECONDS = 86_400;

const profileBody = z.strictObject({
  name: z.string().max(80).optional(),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/).nullable().optional(),
});

/** P15: Account management — profile, data export, and account deletion. */
export const accountRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, auth, valkey } = app;
  const storefrontAuth = guards.authenticate('storefront');
  const reauthGuard = guards.requireAmr([REAUTH_AMR, 'step-up']);

  app.patch(
    '/account/profile',
    { schema: { body: profileBody }, preHandler: storefrontAuth },
    async (request) => {
      const { id: userId } = currentUser(request);
      const { name, phone } = request.body;
      const result = await updateProfile(prisma, userId, {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
      });
      return ok(result);
    },
  );

  app.post(
    '/account/export',
    { preHandler: [storefrontAuth, reauthGuard] },
    async (request) => {
      const { id: userId } = currentUser(request);

      const rateLimitKey = EXPORT_RATE_KEY(userId);
      const exists = await valkey.get(rateLimitKey);
      if (exists !== null) throw new AppError('EXPORT_RATE_LIMITED');

      await valkey.set(rateLimitKey, '1', 'EX', EXPORT_RATE_WINDOW_SECONDS);

      await app.jobs.send('dpdp-export', {
        userId,
        requestedBy: 'SELF',
        actorId: userId,
      });

      auth.events.record('account.export.requested', { userId, ip: request.ip });
      return ok({ queued: true });
    },
  );

  app.delete(
    '/account',
    { preHandler: [storefrontAuth, reauthGuard] },
    async (request, reply) => {
      const user = currentUser(request);

      await eraseUser(
        {
          prisma,
          userState: auth.userState,
          events: auth.events,
          keys: app.ports.keys,
        },
        user.id,
        {
          actor: { actorId: user.id, ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
          source: 'SELF',
          reason: null,
        },
      );

      await auth.refresh.revokeAll(user.id);

      return reply.code(204).send();
    },
  );
};
