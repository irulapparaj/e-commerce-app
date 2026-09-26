import { ok } from '@pe/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { currentUser } from './guards';
import type { SessionMeta } from './refresh.service';
import { refreshBody, sendOtpBody, verifyOtpBody } from './schemas';

const PREVIOUS_SESSION_HEADER = 'x-previous-session';

export const sessionMeta = (request: FastifyRequest): SessionMeta => {
  const previous = request.headers[PREVIOUS_SESSION_HEADER];
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
    previousSessionId: typeof previous === 'string' && previous !== '' ? previous : null,
  };
};

/** DESIGN §9 Auth: OTP login, refresh and logout. Every body is a strict Zod object. */
export const authRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { auth, guards } = app;

  app.post('/auth/send-otp', { schema: { body: sendOtpBody } }, async (request) => {
    const { nonce } = await auth.otp.issue(request.body.email, request.ip);
    auth.events.record('auth.otp.issued', { email: request.body.email, ip: request.ip });
    return ok({ nonce });
  });

  app.post('/auth/verify-otp', { schema: { body: verifyOtpBody } }, async (request) => {
    const result = await auth.login.verifyOtpLogin(request.body, sessionMeta(request));
    if (result.kind === 'mfa-required')
      return ok({ mfaRequired: true as const, mfaToken: result.mfaToken });
    if (result.kind === 'mfa-enrolment-required')
      return ok({ mfaEnrolmentRequired: true as const, mfaToken: result.mfaToken });
    const { accessToken, refreshToken, csrfToken, user, audience, sessionId } = result.session;
    return ok({ accessToken, refreshToken, csrfToken, user, audience, sessionId });
  });

  app.post('/auth/refresh', { schema: { body: refreshBody } }, async (request) => {
    const { accessToken, refreshToken, csrfToken, audience } = await auth.refresh.rotate(
      request.body.refreshToken,
      sessionMeta(request),
    );
    return ok({ accessToken, refreshToken, csrfToken, audience });
  });

  app.post('/auth/logout', { schema: { body: refreshBody } }, async (request) => {
    await auth.refresh.revoke(request.body.refreshToken);
    return ok({ loggedOut: true });
  });

  app.post(
    '/auth/logout-all',
    { preHandler: [guards.authenticate(['storefront', 'admin'])] },
    async (request) => {
      const revoked = await auth.refresh.revokeAll(currentUser(request).id);
      return ok({ revoked });
    },
  );
};
