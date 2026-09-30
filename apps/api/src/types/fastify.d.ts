import type { ApiEnv } from '@pe/shared';
import type Redis from 'ioredis';

import type { PrismaDb, PrismaRaw } from '../db/prisma';
import type { JobQueue } from '../jobs/queue';
import type { JsonCache } from '../lib/cache';
import type { AuthenticatedUser, Guards } from '../modules/auth/guards';
import type { ImageUrlBuilder } from '../modules/media/url';
import type { RazorpayClient } from '../modules/payments/razorpay.client';
import type { RevalidateNotifier } from '../modules/revalidate/notify';
import type { SecurityCounters } from '../modules/security-events/counters';
import type { SettingsStore } from '../modules/settings/store';
import type { AuthServices } from '../plugins/auth';
import type { CatalogueServices, MediaServices } from '../plugins/catalogue';
import type { ReadinessRegistry } from '../plugins/health';
import type { Metrics } from '../plugins/metrics';
import type { OrdersServices } from '../plugins/orders';
import type { RateLimiter } from '../plugins/rate-limit';
import type { Ports } from '../ports';

declare module 'fastify' {
  interface FastifyInstance {
    env: ApiEnv;
    ports: Ports;
    valkey: Redis;
    metrics: Metrics;
    readiness: ReadinessRegistry;
    prisma: PrismaDb;
    prismaRaw: PrismaRaw;
    rateLimiter: RateLimiter;
    auth: AuthServices;
    guards: Guards;
    jobs: JobQueue;
    cache: JsonCache;
    imageUrls: ImageUrlBuilder;
    revalidate: RevalidateNotifier;
    settings: SettingsStore;
    catalogue: CatalogueServices;
    media: MediaServices;
    counters: SecurityCounters;
    orders: OrdersServices;
    razorpay: RazorpayClient;
  }

  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
