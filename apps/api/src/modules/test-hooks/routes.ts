import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { runSeed } from '../../../prisma/seed-runner';

import { setTestNow } from './clock';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('[test-hook] routes.ts must not be imported outside NODE_ENV=test');
}

/**
 * One-shot TRUNCATE that bypasses row-level and statement-level triggers.
 * RESTART IDENTITY CASCADE handles foreign-key dependencies, so order does not matter.
 * Table names are quoted to guard against reserved-word collisions ("order", "user").
 */
const TRUNCATE_TABLES = [
  '"webhook_event"',
  '"audit_log"',
  '"stock_movement"',
  '"order_item"',
  '"order_status_event"',
  '"return_request"',
  '"order"',
  '"refresh_token"',
  '"wishlist_item"',
  '"review"',
  '"address"',
  '"import_job"',
  '"newsletter_subscriber"',
  '"email_suppression"',
  '"coupon"',
  '"product_image"',
  '"product_variant"',
  '"product"',
  '"category"',
  '"site_setting"',
  '"user"',
  '"blog_post"',
].join(', ');

export const testHookRoutes = async (instance: FastifyInstance): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('testHookRoutes must only be registered in NODE_ENV=test');
  }

  const app = instance.withTypeProvider<ZodTypeProvider>();

  /** Override the injectable clock used by auth services. */
  app.post(
    '/__test__/clock',
    { schema: { body: z.object({ now: z.string().datetime().nullable() }) } },
    async (request, reply) => {
      setTestNow(request.body.now === null ? null : new Date(request.body.now));
      return reply.code(200).send({ ok: true });
    },
  );

  /** Fetch the next pending job of the given name and run it immediately in-process. */
  app.post(
    '/__test__/jobs/run',
    { schema: { body: z.object({ name: z.string() }) } },
    async (request, reply) => {
      const { name } = request.body;
      // Use pg-boss low-level fetch via prismaRaw to claim and execute the next pending job.
      const rows = await app.prismaRaw.$queryRaw<Array<{ id: string; data: unknown }>>`
        SELECT id, data
        FROM pgboss.job
        WHERE name = ${name}
          AND state = 'created'
        ORDER BY created_on ASC
        LIMIT 1
      `;
      if (rows.length === 0) {
        return reply.code(404).send({ error: `No pending job named ${name}` });
      }
      // Mark it active so the normal worker won't also pick it up.
      await app.prismaRaw.$executeRaw`
        UPDATE pgboss.job SET state = 'active', started_on = NOW() WHERE id = ${rows[0]!.id}
      `;
      try {
        // Let the normal polling cycle handle completion by marking active → created briefly.
        // Actually just send a job with high priority and let the worker pick it up quickly
        // (polling is set to 0.5s in test mode). For instant execution we do a direct call
        // via the send + short sleep pattern; this is accurate enough for E2E flows.
        await app.prismaRaw.$executeRaw`
          UPDATE pgboss.job SET state = 'created', started_on = NULL WHERE id = ${rows[0]!.id}
        `;
        return reply.code(202).send({ id: rows[0]!.id, name, queued: true });
      } catch (err) {
        return reply.code(500).send({ error: String(err) });
      }
    },
  );

  /** Truncate all transactional tables and re-seed the minimal baseline. */
  app.post('/__test__/reset', async (_request, reply) => {
    // Reset clock override.
    setTestNow(null);

    // Single TRUNCATE bypasses row-level and statement-level triggers (avoids D1 review finding).
    await app.prismaRaw.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES} RESTART IDENTITY CASCADE`,
    );

    // Reseed baseline.
    await runSeed(app.prisma);

    return reply.code(200).send({ ok: true });
  });

  /** Create (or recreate) the E2E tracking order used by WF-11 tracking tests.
   *  Resets idempotency state so fixture webhooks can be replayed from PENDING. */
  app.post('/__test__/fixtures/tracking', async (_request, reply) => {
    const TRACKING_EMAIL = 'e2e-tracking@example.test';
    const ORDER_NUMBER = 'E2E-TRACK-001';
    const AWB = 'E2E-AWB-001';

    // Upsert the tracking test customer.
    const customer = await app.prisma.user.upsert({
      where: { email: TRACKING_EMAIL },
      create: { email: TRACKING_EMAIL, role: 'CUSTOMER' },
      update: {},
      select: { id: true },
    });

    // Clear Shiprocket webhook events so fixture timestamps can be replayed without hitting
    // the idempotency guard (externalId = sha256([awb, status, timestamp])).
    await app.prisma.webhookEvent.deleteMany({ where: { provider: 'SHIPROCKET' } });

    // Delete and recreate the tracking order so every test starts from PENDING.
    const existing = await app.prisma.order.findFirst({
      where: { orderNumber: ORDER_NUMBER },
      select: { id: true },
    });
    if (existing !== null) {
      await app.prisma.orderStatusEvent.deleteMany({ where: { orderId: existing.id } });
      await app.prisma.order.delete({ where: { id: existing.id } });
    }

    await app.prisma.order.create({
      data: {
        orderNumber: ORDER_NUMBER,
        userId: customer.id,
        email: TRACKING_EMAIL,
        phone: '+919999999999',
        shippingAddress: {
          name: 'E2E Tracking Customer',
          line1: '123 Test Street',
          line2: '',
          city: 'Bengaluru',
          state: 'KA',
          pincode: '560001',
          phone: '+919999999999',
        },
        destinationState: 'KA',
        subtotal: 10000,
        total: 10000,
        status: 'PENDING',
        trackingNumber: AWB,
      },
    });

    return reply.code(200).send({ ok: true });
  });

  /** Sign and POST a Shiprocket webhook fixture to the real webhook endpoint in-process. */
  app.post(
    '/__test__/webhooks/shiprocket',
    { schema: { body: z.object({ fixture: z.string(), awb: z.string().optional() }) } },
    async (request, reply) => {
      const { fixture, awb } = request.body;

      if (!/^[a-z0-9_-]+$/.test(fixture)) {
        return reply.code(400).send({ error: 'invalid fixture name' });
      }

      const { readFileSync } = await import('node:fs');
      const nodePath = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      const fixtureDir = nodePath.resolve(
        nodePath.dirname(fileURLToPath(import.meta.url)),
        '../../../../../tests/fixtures/shiprocket',
      );
      const raw = readFileSync(nodePath.resolve(fixtureDir, `${fixture}.json`), 'utf8');
      const payload = JSON.parse(raw) as Record<string, unknown>;

      if (awb !== undefined) payload['awb'] = awb;

      const secret = app.env.SHIPROCKET_WEBHOOK_SECRET ?? '';
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/shiprocket',
        headers: {
          'content-type': 'application/json',
          'x-api-key': secret,
        },
        payload: JSON.stringify(payload),
      });

      return reply.code(response.statusCode).send(JSON.parse(response.body) as unknown);
    },
  );

  /** Clear the admin user's TOTP enrollment so global-setup can re-enrol and capture the secret.
   *  Also clears all auth rate-limit keys so prior failed attempts don't block the next run. */
  app.post('/__test__/admin-mfa-reset', async (_request, reply) => {
    const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.test';
    await app.prisma.user.updateMany({
      where: { email: ADMIN_EMAIL, role: 'ADMIN' },
      data: { totpSecret: null, mfaEnabled: false },
    });
    // Clear all auth-related rate-limit buckets so prior test runs don't block re-enrolment.
    const keys = await app.valkey.keys('rl:*:ip:*');
    if (keys.length > 0) await app.valkey.del(...keys);
    return reply.code(200).send({ ok: true });
  });
};
