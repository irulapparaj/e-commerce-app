import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { currentUser } from './guards';
import { sessionMeta } from './routes';
import { mfaVerifyBody, stepUpBody } from './schemas';

/** DESIGN §11.3: admin login 10 / h / IP applies to MFA verification and step-up attempts. */
const ADMIN_LOGIN_LIMIT = { limit: 10, windowSeconds: 3600 } as const;

export const mfaRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { auth, guards, rateLimiter } = app;
  const mfaOnly = [guards.authenticate('mfa'), guards.requireRole('ADMIN', 'STAFF')];

  app.post('/auth/mfa/enrol', { preHandler: mfaOnly }, async (request) =>
    ok(await auth.mfa.enrol(currentUser(request).id)),
  );

  app.post(
    '/auth/mfa/verify',
    { schema: { body: mfaVerifyBody }, preHandler: mfaOnly },
    async (request) => {
      await rateLimiter.consume([{ key: `mfa-verify:ip:${request.ip}`, ...ADMIN_LOGIN_LIMIT }]);
      const user = currentUser(request);
      const session = await auth.login.completeMfa(
        user.id,
        request.body.code,
        sessionMeta(request),
      );
      auth.userState.invalidate(user.id);
      const { accessToken, refreshToken, csrfToken, audience, sessionId } = session;
      return ok({ accessToken, refreshToken, csrfToken, user: session.user, audience, sessionId });
    },
  );

  app.post(
    '/auth/step-up',
    {
      schema: { body: stepUpBody },
      preHandler: [guards.authenticate('admin'), guards.requireMfaEnrolled()],
    },
    async (request) => {
      await rateLimiter.consume([{ key: `step-up:ip:${request.ip}`, ...ADMIN_LOGIN_LIMIT }]);
      return ok(await auth.login.stepUp(currentUser(request).id, request.body.code));
    },
  );
};
