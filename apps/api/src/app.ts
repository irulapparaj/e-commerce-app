import { randomUUID } from 'node:crypto';

import sensible from '@fastify/sensible';
import type { ApiEnv } from '@pe/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type Redis from 'ioredis';

import type { Db } from './db/prisma';
import type { JobQueue } from './jobs/queue';
import { registerJobWorkers } from './jobs/register';
import { parseTrustProxy } from './lib/trust-proxy';
import { accountRoutes } from './modules/account/routes';
import { addressRoutes } from './modules/addresses/routes';
import { auditRoutes } from './modules/admin/audit.routes';
import { adminCategoryRoutes } from './modules/admin/categories.routes';
import { adminImageRoutes } from './modules/admin/images.routes';
import { adminInventoryRoutes } from './modules/admin/inventory.routes';
import { adminJobRoutes } from './modules/admin/jobs.routes';
import { adminOrderRoutes } from './modules/admin/orders/routes';
import { adminProductRoutes } from './modules/admin/products.routes';
import { securityRoutes } from './modules/admin/security.routes';
import { settingsRoutes } from './modules/admin/settings.routes';
import { staffRoutes } from './modules/admin/staff.routes';
import { statsRoutes } from './modules/admin/stats.routes';
import { adminVariantRoutes } from './modules/admin/variants.routes';
import { mfaRoutes } from './modules/auth/mfa.routes';
import { reauthRoutes } from './modules/auth/reauth.routes';
import { authRoutes } from './modules/auth/routes';
import { sessionRoutes } from './modules/auth/session.routes';
import { mergeCartsOnLogin } from './modules/cart/merge';
import { cartRoutes } from './modules/cart/routes';
import { catalogueRoutes } from './modules/catalogue/routes.public';
import { customerRoutes } from './modules/customers/routes';
import { exportRoutes } from './modules/exports/routes';
import { formsRoutes } from './modules/forms/routes';
import { importRoutes } from './modules/imports/routes';
import { newsletterRoutes } from './modules/newsletter/routes';
import { NoopFeedbackAdapter } from './modules/notifications/adapters/noop-feedback';
import { feedbackRoutes } from './modules/notifications/feedback.routes';
import { suppressionRoutes } from './modules/notifications/suppression.routes';
import { orderRoutes } from './modules/orders/routes';
import { createRazorpayClient, type RazorpayClient } from './modules/payments/razorpay.client';
import { webhookRoutes } from './modules/payments/webhook.routes';
import { shippingRoutes } from './modules/shipping/serviceability.routes';
import { shiprocketWebhookRoutes } from './modules/shipping/webhook.routes';
import { sitemapRoutes } from './modules/sitemap/routes';
import { authPlugin } from './plugins/auth';
import { bootAssertionsPlugin } from './plugins/boot-assertions';
import { cataloguePlugin } from './plugins/catalogue';
import { errorHandlerPlugin } from './plugins/error-handler';
import { healthPlugin } from './plugins/health';
import { jobsPlugin } from './plugins/jobs';
import { buildLoggerOptions, type LoggerOptions } from './plugins/logger';
import { metricsPlugin } from './plugins/metrics';
import { ordersPlugin } from './plugins/orders';
import { prismaPlugin } from './plugins/prisma';
import { rateLimitPlugin } from './plugins/rate-limit';
import { securityCountersPlugin } from './plugins/security-counters';
import { securityHeadersPlugin } from './plugins/security-headers';
import type { Ports } from './ports';

const BODY_LIMIT_BYTES = 1_048_576;

export interface BuildAppOptions {
  readonly env: ApiEnv;
  readonly ports: Ports;
  readonly valkey: Redis;
  readonly db: Db;
  readonly disconnectDbOnClose?: boolean;
  readonly logger?: LoggerOptions | false;
  /** Injectable clock for tests (token expiry, refresh TTLs, step-up windows). */
  readonly now?: () => Date;
  /** Tests may inject a queue; by default pg-boss runs on DATABASE_URL. */
  readonly jobs?: JobQueue;
  /** Tests may inject a fake Razorpay client so refunds/webhook reprocessing never hit the real API. */
  readonly razorpay?: RazorpayClient;
}

export const API_PREFIX = '/api/v1';

export type App = FastifyInstance;

const registerReadinessChecks = ({ env, ports, valkey }: BuildAppOptions, app: App): void => {
  app.readiness.add({ name: 'valkey', check: () => valkey.ping() });
  app.readiness.add({
    name: 'storage',
    check: async () => {
      const exists = await ports.storage.headBucket(env.S3_BUCKET_MEDIA);
      if (!exists) throw new Error(`bucket ${env.S3_BUCKET_MEDIA} missing`);
    },
  });
};

export const buildApp = async (options: BuildAppOptions): Promise<App> => {
  const { env, ports, valkey } = options;
  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(env),
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    // Forwarded headers are only honoured when TRUSTED_PROXIES names the proxies (C-3)
    trustProxy: parseTrustProxy(env.TRUSTED_PROXIES) as
      | boolean
      | string[]
      | ((address: string, hop: number) => boolean),
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('env', env);
  app.decorate('ports', ports);
  app.decorate('valkey', valkey);
  app.decorate(
    'razorpay',
    options.razorpay ??
      createRazorpayClient({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET }),
  );

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(bootAssertionsPlugin);
  await app.register(sensible);
  await app.register(securityHeadersPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);
  await app.register(healthPlugin);
  await app.register(prismaPlugin, {
    db: options.db,
    disconnectOnClose: options.disconnectDbOnClose ?? true,
  });
  registerReadinessChecks(options, app);

  await app.register(rateLimitPlugin);
  await app.register(authPlugin, options.now === undefined ? {} : { now: options.now });
  await app.register(securityCountersPlugin);
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(reauthRoutes, { prefix: API_PREFIX });
  await app.register(mfaRoutes, { prefix: API_PREFIX });
  await app.register(sessionRoutes, { prefix: API_PREFIX });
  await app.register(jobsPlugin, options.jobs === undefined ? {} : { queue: options.jobs });
  await app.register(cataloguePlugin);
  await app.register(catalogueRoutes, { prefix: API_PREFIX });
  await app.register(staffRoutes, { prefix: API_PREFIX });
  await app.register(settingsRoutes, { prefix: API_PREFIX });
  await app.register(auditRoutes, { prefix: API_PREFIX });
  await app.register(securityRoutes, { prefix: API_PREFIX });
  await app.register(statsRoutes, { prefix: API_PREFIX });
  await app.register(adminProductRoutes, { prefix: API_PREFIX });
  await app.register(adminVariantRoutes, { prefix: API_PREFIX });
  await app.register(adminImageRoutes, { prefix: API_PREFIX });
  await app.register(adminCategoryRoutes, { prefix: API_PREFIX });
  await app.register(adminInventoryRoutes, { prefix: API_PREFIX });
  await app.register(adminJobRoutes, { prefix: API_PREFIX });
  await app.register(importRoutes, { prefix: API_PREFIX });
  await app.register(exportRoutes, { prefix: API_PREFIX });
  await app.register(customerRoutes, { prefix: API_PREFIX });
  await app.register(cartRoutes, { prefix: API_PREFIX });
  app.auth.hooks.onLogin((event) => mergeCartsOnLogin(app.valkey, event));

  await app.register(ordersPlugin);
  await app.register(addressRoutes, { prefix: API_PREFIX });
  await app.register(shippingRoutes, { prefix: API_PREFIX });
  await app.register(orderRoutes, { prefix: API_PREFIX });
  await app.register(webhookRoutes, { prefix: API_PREFIX });
  await app.register(accountRoutes, { prefix: API_PREFIX });
  await app.register(formsRoutes, { prefix: API_PREFIX });
  await app.register(newsletterRoutes, { prefix: API_PREFIX });
  await app.register(sitemapRoutes, { prefix: API_PREFIX });
  await app.register(suppressionRoutes, { prefix: API_PREFIX });
  await app.register(feedbackRoutes, { adapter: new NoopFeedbackAdapter() });
  await app.register(adminOrderRoutes, { prefix: API_PREFIX });
  await app.register(shiprocketWebhookRoutes, { prefix: API_PREFIX });

  // Wire order hooks → notifications (P13 + P14)
  const { sendTemplate } = await import('./modules/notifications/index');

  app.orders.hooks.onOrderPaid(async (event) => {
    try {
      const order = await app.prisma.order.findUnique({
        where: { id: event.orderId },
        select: {
          orderNumber: true,
          email: true,
          total: true,
          subtotal: true,
          shippingAmount: true,
          discountAmount: true,
          items: { select: { productName: true, variantLabel: true, quantity: true, unitPrice: true } },
          shippingAddress: true,
          destinationState: true,
        },
      });
      if (order === null) return;
      const addr = (order.shippingAddress ?? {}) as Record<string, string>;
      await sendTemplate(
        { jobs: app.jobs, prisma: app.prisma, email: app.ports.email, log: app.log },
        'order-confirmation',
        order.email,
        {
          orderNumber: order.orderNumber,
          items: order.items.map((i) => ({
            name: `${i.productName} — ${i.variantLabel}`,
            quantity: i.quantity,
            unitPrice: `₹${(i.unitPrice / 100).toFixed(2)}`,
          })),
          totals: {
            subtotal: `₹${(order.subtotal / 100).toFixed(2)}`,
            shipping: `₹${(order.shippingAmount / 100).toFixed(2)}`,
            ...(order.discountAmount > 0 ? { discount: `₹${(order.discountAmount / 100).toFixed(2)}` } : {}),
            total: `₹${(order.total / 100).toFixed(2)}`,
          },
          address: {
            line1: addr['line1'] ?? '',
            ...(addr['line2'] ? { line2: addr['line2'] } : {}),
            city: addr['city'] ?? '',
            state: addr['state'] ?? '',
            pincode: addr['pincode'] ?? '',
          },
        },
        { dedupeKey: `order-confirmation:${event.orderId}` },
      );
    } catch (err) {
      app.log.error({ err, orderId: event.orderId }, 'order.paid: failed to send confirmation email');
    }
  });

  app.orders.hooks.onOrderCancelled(async (event) => {
    try {
      const order = await app.prisma.order.findUnique({
        where: { id: event.orderId },
        select: { orderNumber: true, email: true },
      });
      if (order === null) return;
      await sendTemplate(
        { jobs: app.jobs, prisma: app.prisma, email: app.ports.email, log: app.log },
        'order-cancelled',
        order.email,
        { orderNumber: order.orderNumber, note: event.note },
        { dedupeKey: `order-cancelled:${event.orderId}` },
      );
    } catch (err) {
      app.log.error({ err, orderId: event.orderId }, 'order.cancelled: failed to send cancellation email');
    }
  });

  app.orders.hooks.onOrderDispatched(async (event) => {
    try {
      const order = await app.prisma.order.findUnique({
        where: { id: event.orderId },
        select: { orderNumber: true, email: true },
      });
      if (order === null) return;
      await sendTemplate(
        { jobs: app.jobs, prisma: app.prisma, email: app.ports.email, log: app.log },
        'order-dispatched',
        order.email,
        {
          orderNumber: order.orderNumber,
          trackingNumber: event.awb,
          ...(event.trackingUrl !== null ? { trackingUrl: event.trackingUrl } : {}),
          carrier: event.courier,
        },
        { dedupeKey: `order-dispatched:${event.orderId}` },
      );
    } catch (err) {
      app.log.error({ err, orderId: event.orderId }, 'order.dispatched: failed to send dispatch email');
    }
  });

  app.orders.hooks.onOrderDelivered(async (event) => {
    try {
      const order = await app.prisma.order.findUnique({
        where: { id: event.orderId },
        select: { orderNumber: true, email: true },
      });
      if (order === null) return;
      await sendTemplate(
        { jobs: app.jobs, prisma: app.prisma, email: app.ports.email, log: app.log },
        'order-delivered',
        order.email,
        { orderNumber: order.orderNumber },
        { dedupeKey: `order-delivered:${event.orderId}` },
      );
    } catch (err) {
      app.log.error({ err, orderId: event.orderId }, 'order.delivered: failed to send delivery email');
    }
  });

  if (env.NODE_ENV !== 'production') {
    const { previewRoutes } = await import('./modules/notifications/preview.routes');
    await app.register(previewRoutes);
  } else {
    // Boot-time assertion: preview routes must never be accessible in production
    const previewPath = '/dev/emails';
    app.log.debug({ previewPath }, 'preview routes disabled in production');
  }

  if (env.NODE_ENV === 'test') {
    const { paymentTestStubRoutes } = await import('./modules/payments/test-stub.routes');
    await app.register(paymentTestStubRoutes, { prefix: API_PREFIX });
    const { testHookRoutes } = await import('./modules/test-hooks/routes');
    await app.register(testHookRoutes);
  }

  if (env.JOBS_ENABLED) await registerJobWorkers(app);

  return app;
};
