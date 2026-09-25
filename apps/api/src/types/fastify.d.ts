import type { ApiEnv } from '@pe/shared';
import type Redis from 'ioredis';

import type { PrismaDb, PrismaRaw } from '../db/prisma';
import type { ReadinessRegistry } from '../plugins/health';
import type { Metrics } from '../plugins/metrics';
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
  }
}
