import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { EmailFeedbackAdapter } from './feedback.port';
import { addSuppression } from './suppression';

export interface FeedbackRoutesOptions {
  readonly adapter: EmailFeedbackAdapter;
}

/**
 * POST /webhooks/email — receives bounce/complaint notifications from the email provider.
 * The noop adapter returns null → 404 until P19 configures a real adapter.
 */
export const feedbackRoutes = async (
  instance: FastifyInstance,
  options: FeedbackRoutesOptions,
): Promise<void> => {
  const app = instance;

  // Raw body parser for this scope
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_request, body: Buffer, done) => {
      try {
        const parsed = JSON.parse(body.toString('utf8')) as unknown;
        (_request as { rawBody?: Buffer }).rawBody = body;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post('/webhooks/email', async (request, reply) => {
    const rawBody = (request as { rawBody?: Buffer }).rawBody;
    if (rawBody === undefined) {
      return reply.code(400).send({ error: 'missing body' });
    }

    const result = await options.adapter.parse(
      rawBody,
      request.headers,
    );

    if (result === null) {
      return reply.code(404).send({ error: 'not handled' });
    }

    const externalId = randomUUID();

    // Store webhook event (unique constraint handles replays)
    try {
      await app.prisma.webhookEvent.create({
        data: {
          provider: 'EMAIL',
          externalId,
          signatureValid: true,
          payload: { events: result.events },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Unique constraint')) {
        return reply.code(200).send({ received: true });
      }
      throw err;
    }

    // Add suppressions for hard bounces and complaints
    for (const event of result.events) {
      const shouldSuppress =
        (event.type === 'BOUNCE' && event.hard) || event.type === 'COMPLAINT';
      if (shouldSuppress) {
        await addSuppression({
          prisma: app.prisma,
          emailHash: event.emailHash,
          reason: event.type === 'COMPLAINT' ? 'COMPLAINT' : 'BOUNCE',
        });
      }
    }

    app.log.info({ count: result.events.length }, 'email.feedback.processed');

    return reply.code(200).send({ received: true });
  });
};
