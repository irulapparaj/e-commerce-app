/**
 * Newsletter subscribe / unsubscribe routes (H-33).
 *
 * POST /newsletter/subscribe  — creates or re-activates a subscription.
 * GET  /newsletter/unsubscribe?token=<token> — honours consent withdrawal (DPDP / CAN-SPAM).
 */
import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { hashEmail } from '../notifications/suppression';

import { generateUnsubscribeToken, verifyUnsubscribeToken } from './token';

const subscribeBody = z.strictObject({ email: z.string().email(), website: z.string().optional() });
const unsubscribeQuery = z.object({ token: z.string().min(1) });

const NEWSLETTER_RATE_LIMIT = { limit: 5, windowSeconds: 3600 };

export const newsletterRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { prisma, rateLimiter, ports } = app;

  /** POST /newsletter/subscribe */
  app.post(
    '/newsletter/subscribe',
    { schema: { body: subscribeBody } },
    async (request, reply) => {
      const { email, website } = request.body;

      // Honeypot: silently succeed without persisting
      if (typeof website === 'string' && website.length > 0) {
        return reply.status(200).send(ok({ status: 'subscribed' }));
      }

      await rateLimiter.consume([
        { key: `newsletter:sub:ip:${request.ip}`, ...NEWSLETTER_RATE_LIMIT },
      ]);

      const normalised = email.toLowerCase().trim();
      const hash = hashEmail(ports.keys, normalised);
      const existing = await prisma.newsletterSubscriber.findUnique({
        where: { emailHash: hash },
      });

      if (existing !== null) {
        if (existing.unsubscribedAt !== null) {
          await prisma.newsletterSubscriber.update({
            where: { emailHash: hash },
            data: { unsubscribedAt: null, status: 'SUBSCRIBED' },
          });
        }
        return reply.status(200).send(ok({ status: 'already_subscribed' }));
      }

      await prisma.newsletterSubscriber.create({
        data: {
          emailHash: hash,
          emailEncrypted: normalised,
          unsubscribeToken: generateUnsubscribeToken(),
          consentAt: new Date(),
          status: 'SUBSCRIBED',
          source: 'storefront',
        },
      });
      return reply.status(200).send(ok({ status: 'subscribed' }));
    },
  );

  /** GET /newsletter/unsubscribe?token=<token> */
  app.get(
    '/newsletter/unsubscribe',
    { schema: { querystring: unsubscribeQuery } },
    async (request, reply) => {
      const { token } = request.query;
      const record = await prisma.newsletterSubscriber.findUnique({
        where: { unsubscribeToken: token },
      });

      if (record === null || record.unsubscribeToken === null || !verifyUnsubscribeToken(token, record.unsubscribeToken)) {
        return reply.status(404).send({ success: false, message: 'Invalid or expired token.' });
      }

      if (record.unsubscribedAt === null) {
        await prisma.newsletterSubscriber.update({
          where: { unsubscribeToken: token },
          data: { unsubscribedAt: new Date() },
        });
      }

      return reply
        .status(200)
        .header('content-type', 'text/html; charset=utf-8')
        .send(
          '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
            '<title>Unsubscribed</title></head>' +
            '<body><h1>You have been unsubscribed.</h1>' +
            '<p>You will no longer receive marketing emails from us.</p></body></html>',
        );
    },
  );
};
