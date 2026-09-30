import { AppError, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { REAUTH_AMR, REAUTH_TTL_SECONDS, currentUser } from './guards';
import { sessionMeta } from './routes';

const sendReauthBody = z.strictObject({});
const verifyReauthBody = z.strictObject({
  nonce: z.string().min(1),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

/** P15: Customer re-authentication via OTP, produces amr:['reauth'] with 5-min step-up. */
export const reauthRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { auth, guards } = app;
  const storefrontAuth = guards.authenticate('storefront');

  app.post(
    '/auth/reauth/send',
    { schema: { body: sendReauthBody }, preHandler: storefrontAuth },
    async (request) => {
      const user = currentUser(request);
      const dbUser = await app.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { email: true },
      });
      const { nonce } = await auth.otp.issue(dbUser.email, request.ip);
      auth.events.record('auth.reauth.otp.issued', { userId: user.id, ip: request.ip });
      return ok({ nonce });
    },
  );

  app.post(
    '/auth/reauth/verify',
    { schema: { body: verifyReauthBody }, preHandler: storefrontAuth },
    async (request) => {
      const user = currentUser(request);
      const dbUser = await app.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { email: true },
      });
      const valid = await auth.otp.verify(dbUser.email, request.body.nonce, request.body.otp, request.ip);
      if (!valid) {
        auth.events.record('auth.reauth.failed', { userId: user.id, ip: request.ip });
        throw new AppError('INVALID_OTP');
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const stepUpExp = nowSeconds + REAUTH_TTL_SECONDS;
      const accessToken = await auth.tokens.signAccess({
        sub: user.id,
        role: user.role,
        aud: 'storefront',
        amr: [REAUTH_AMR],
        stepUpExp,
      });

      auth.events.record('auth.reauth.success', { userId: user.id, ip: sessionMeta(request).ip });
      return ok({ accessToken });
    },
  );
};
