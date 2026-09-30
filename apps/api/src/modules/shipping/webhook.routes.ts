import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { isForwardTransition } from '../admin/orders/transitions';
import { sanitizeWebhookPayload } from '../payments/webhook.sanitize';

import { mapShiprocketStatus, mapShipmentToOrderStatus } from './status-map';

const PROVIDER = 'SHIPROCKET';

/** Parse comma-separated IPs from an env string. */
const parseIpList = (raw: string | undefined): readonly string[] =>
  raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];

const sha256 = (parts: readonly string[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex');

interface ShiprocketWebhookPayload {
  readonly awb?: string;
  readonly current_status?: string;
  readonly shipment_status?: string;
  readonly updated_at?: string;
  readonly order_id?: string | number;
  [key: string]: unknown;
}

/**
 * Shiprocket webhook handler.
 *
 * Security:
 * - Verifies `x-api-key` header against `SHIPROCKET_WEBHOOK_SECRET` (timingSafeEqual).
 * - Verifies source IP against `SHIPROCKET_WEBHOOK_IPS`.
 * - `X-Forwarded-For` is only trusted when the connecting IP is in `TRUSTED_PROXIES`.
 */
export const shiprocketWebhookRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance;

  app.post('/webhooks/shiprocket', async (request, reply) => {
    const env = app.env;

    // ── 1. Verify secret ─────────────────────────────────────────────────────
    const webhookSecret = env.SHIPROCKET_WEBHOOK_SECRET;
    if (!webhookSecret) {
      app.log.error('SHIPROCKET_WEBHOOK_SECRET not configured');
      return reply.code(503).send({ error: 'Webhook not configured' });
    }

    const incomingKey = request.headers['x-api-key'];
    if (typeof incomingKey !== 'string') {
      return reply.code(401).send({ error: 'Missing x-api-key' });
    }

    const secretBuf = Buffer.from(webhookSecret);
    const keyBuf = Buffer.from(incomingKey);
    const validSecret =
      secretBuf.length === keyBuf.length &&
      timingSafeEqual(secretBuf, keyBuf);

    if (!validSecret) {
      return reply.code(401).send({ error: 'Invalid webhook secret' });
    }

    // ── 2. Verify source IP ───────────────────────────────────────────────────
    const allowedIps = parseIpList(env.SHIPROCKET_WEBHOOK_IPS);
    if (allowedIps.length > 0) {
      const trustedProxies = new Set(parseIpList(env.TRUSTED_PROXIES));
      const connectingIp = request.ip;

      // Trust X-Forwarded-For only if connecting IP is a known proxy
      let sourceIp = connectingIp;
      if (trustedProxies.has(connectingIp)) {
        const forwarded = request.headers['x-forwarded-for'];
        if (typeof forwarded === 'string') {
          sourceIp = forwarded.split(',')[0]?.trim() ?? connectingIp;
        }
      }

      if (!allowedIps.includes(sourceIp)) {
        app.log.warn({ sourceIp, allowedIps }, 'shiprocket.webhook: IP not in allow-list');
        return reply.code(403).send({ error: 'Source IP not allowed' });
      }
    }

    // ── 3. Parse payload ─────────────────────────────────────────────────────
    const payload = request.body as ShiprocketWebhookPayload;
    const awb = payload.awb ?? '';
    const rawStatus = payload.current_status ?? payload.shipment_status ?? '';
    const timestamp = payload.updated_at ?? new Date().toISOString();

    const externalId = sha256([awb, rawStatus, timestamp]);

    // ── 4. Idempotency: store WebhookEvent ───────────────────────────────────
    let alreadyProcessed = false;
    try {
      await app.prisma.webhookEvent.create({
        data: {
          provider: PROVIDER,
          externalId,
          signatureValid: true,
          // Courier payloads can carry consignee contact details — scrubbed at write (C-4)
          payload: sanitizeWebhookPayload(payload),
        },
      });
    } catch (err: unknown) {
      // Unique constraint violation — replay
      const isUniqueViolation =
        err instanceof Error && err.message.includes('Unique constraint');
      if (isUniqueViolation) {
        alreadyProcessed = true;
      } else {
        throw err;
      }
    }

    if (alreadyProcessed) {
      return reply.code(200).send({ ok: true, replayed: true });
    }

    // ── 5. Map status ─────────────────────────────────────────────────────────
    const internalShipmentStatus = mapShiprocketStatus(rawStatus);
    if (internalShipmentStatus === null) {
      app.log.debug({ awb, rawStatus }, 'shiprocket.webhook: ignored status');
      return reply.code(200).send({ ok: true, ignored: true });
    }

    const orderStatus = mapShipmentToOrderStatus(internalShipmentStatus);

    // ── 6. Find order by AWB ─────────────────────────────────────────────────
    if (!awb) {
      app.log.warn({ payload }, 'shiprocket.webhook: no AWB in payload');
      return reply.code(200).send({ ok: true, noAwb: true });
    }

    const order = await app.prisma.order.findFirst({
      where: { trackingNumber: awb },
      select: { id: true, status: true, courierName: true, trackingNumber: true },
    });

    if (order === null) {
      app.log.warn({ awb }, 'shiprocket.webhook: no order found for AWB');
      return reply.code(200).send({ ok: true, orderNotFound: true });
    }

    // ── 7. Forward-only transition guard ─────────────────────────────────────
    if (!isForwardTransition(order.status, orderStatus)) {
      app.log.debug({ awb, from: order.status, to: orderStatus }, 'shiprocket.webhook: regression ignored');
      return reply.code(200).send({ ok: true, ignored: true });
    }

    // ── 8. Apply transition ───────────────────────────────────────────────────
    const deliveredAt = orderStatus === 'DELIVERED' ? new Date(timestamp) : null;

    await app.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: orderStatus,
          ...(deliveredAt !== null ? { deliveredAt } : {}),
        },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          status: orderStatus,
          note: `Shiprocket webhook: ${rawStatus}`,
          source: 'WEBHOOK',
        },
      });

      await tx.webhookEvent.updateMany({
        where: { provider: PROVIDER, externalId },
        data: { processedAt: new Date() },
      });

      // ── 9. Enqueue notification job inside the transaction so it is committed
      //       atomically with the status change. A post-transaction emit would be
      //       permanently lost if the server crashes between steps 8 and 9.
      await app.jobs.send('shipping.status.notify', {
        orderId: order.id,
        orderStatus,
        awb: order.trackingNumber ?? awb,
        courierName: order.courierName ?? null,
        trackingNumber: order.trackingNumber ?? null,
        deliveredAt: deliveredAt !== null ? deliveredAt.toISOString() : null,
        rawStatus,
      });
    });

    app.log.info({ awb, from: order.status, to: orderStatus }, 'shiprocket.webhook: processed');
    return reply.code(200).send({ ok: true });
  });
};
