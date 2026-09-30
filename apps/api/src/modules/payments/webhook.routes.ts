import type { FastifyInstance } from 'fastify';

import { verifyWebhookSignature } from './signature';
import type { RazorpayEvent, WebhookHandlerDeps } from './webhook.handlers';
import { processRazorpayEvent } from './webhook.process';
import { sanitizeWebhookPayload } from './webhook.sanitize';

const isUniqueViolation = (err: unknown): boolean =>
  (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') ||
  (err instanceof Error && err.message.includes('Unique constraint'));

/**
 * P12: Razorpay webhook endpoint. Raw body required for HMAC verification.
 *
 * Review fix C-1: events are processed inline and to completion. Success stamps
 * `processedAt`; failure returns 500 so Razorpay retries, and a replay of an
 * unprocessed event re-runs the handler instead of being swallowed by the dedupe row.
 * Review fix C-4: payloads are PII-scrubbed before they are stored.
 */
export const webhookRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance;

  // Raw body parser — must be registered on the scope that handles /webhooks/razorpay
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

  app.post('/webhooks/razorpay', async (request, reply) => {
    await app.rateLimiter.consume([
      { key: `webhook:razorpay:${request.ip}`, limit: 120, windowSeconds: 60 },
    ]);

    const signature = request.headers['x-razorpay-signature'];
    const rawBody = (request as { rawBody?: Buffer }).rawBody;
    const secret = app.env.RAZORPAY_WEBHOOK_SECRET;

    if (typeof signature !== 'string' || rawBody === undefined) {
      return reply.code(400).send({ error: 'missing signature or body' });
    }

    const valid = verifyWebhookSignature(rawBody, signature, secret);

    const event = request.body as RazorpayEvent;

    // Reject invalid signatures before writing anything to the DB
    if (!valid) {
      app.log.warn({ eventId: event.id }, 'Razorpay webhook: invalid signature rejected');
      return reply.code(400).send({ error: 'invalid signature' });
    }

    if (typeof event.id !== 'string' || event.id === '' || typeof event.event !== 'string') {
      return reply.code(400).send({ error: 'malformed event' });
    }

    // Store the event for idempotency; PII is scrubbed before the payload is persisted (C-4).
    try {
      await app.prisma.webhookEvent.create({
        data: {
          provider: 'RAZORPAY',
          externalId: event.id,
          signatureValid: true,
          payload: sanitizeWebhookPayload(event),
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await app.prisma.webhookEvent.findUnique({
        where: { provider_externalId: { provider: 'RAZORPAY', externalId: event.id } },
        select: { processedAt: true },
      });
      // Fully processed before — a true replay.
      if (existing?.processedAt != null) {
        return reply.code(200).send({ received: true, replayed: true });
      }
      // Received before but never processed: fall through and process it now (C-1).
    }

    const deps: WebhookHandlerDeps = {
      prisma: app.prisma,
      hooks: app.orders.hooks,
      log: app.log,
      razorpay: app.razorpay,
    };
    const result = await processRazorpayEvent(deps, event);
    if (!result.ok) {
      // Non-2xx makes Razorpay retry; the reconcile sweep is the backstop after that.
      return reply.code(500).send({ received: false, error: 'processing failed' });
    }

    return reply.code(200).send({ received: true });
  });
};
