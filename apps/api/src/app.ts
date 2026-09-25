import { randomUUID } from 'node:crypto';

import helmet from '@fastify/helmet';
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
import { errorHandlerPlugin } from './plugins/error-handler';
import { healthPlugin } from './plugins/health';
import { buildLoggerOptions, type LoggerOptions } from './plugins/logger';
import { metricsPlugin } from './plugins/metrics';
import { prismaPlugin } from './plugins/prisma';
import type { Ports } from './ports';

const BODY_LIMIT_BYTES = 1_048_576;

export interface BuildAppOptions {
  readonly env: ApiEnv;
  readonly ports: Ports;
  readonly valkey: Redis;
  readonly db: Db;
  readonly disconnectDbOnClose?: boolean;
  readonly logger?: LoggerOptions | false;
}

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
    trustProxy: true,
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('env', env);
  app.decorate('ports', ports);
  app.decorate('valkey', valkey);

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(sensible);
  await app.register(helmet);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);
  await app.register(healthPlugin);
  await app.register(prismaPlugin, {
    db: options.db,
    disconnectOnClose: options.disconnectDbOnClose ?? true,
  });
  registerReadinessChecks(options, app);

  return app;
};
