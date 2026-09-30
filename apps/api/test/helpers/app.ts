import type { ApiEnv } from '@pe/shared';
import type Redis from 'ioredis';

import { type App, buildApp } from '../../src/app';
import type { JobQueue } from '../../src/jobs/queue';
import { connectValkey, createValkeyClient } from '../../src/lib/valkey';
import type { RazorpayClient } from '../../src/modules/payments/razorpay.client';
import { createPorts, type Ports } from '../../src/ports';
import { FakeEmailAdapter } from '../../src/ports/adapters/fake-email';

import { getPrisma, getPrismaRaw } from './db';
import { buildTestEnv } from './env';

export interface TestApp {
  readonly app: App;
  readonly env: ApiEnv;
  readonly ports: Ports;
  readonly email: FakeEmailAdapter | null;
  readonly valkey: Redis;
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly env?: Record<string, string | undefined>;
  readonly ports?: Partial<Ports>;
  readonly now?: () => Date;
  readonly jobs?: JobQueue;
  readonly razorpay?: RazorpayClient;
}

/** Builds the real app against the containers started by test/helpers/containers.ts. */
export const buildTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const env = buildTestEnv(options.env);
  const ports = createPorts(env, options.ports, { prismaRaw: getPrismaRaw() });
  const valkey = createValkeyClient(env.VALKEY_URL);
  await connectValkey(valkey);
  const db = { prisma: getPrisma(), raw: getPrismaRaw() };
  const app = await buildApp({
    env,
    ports,
    valkey,
    db,
    disconnectDbOnClose: false,
    logger: false,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.jobs === undefined ? {} : { jobs: options.jobs }),
    ...(options.razorpay === undefined ? {} : { razorpay: options.razorpay }),
  });
  await app.ready();
  return {
    app,
    env,
    ports,
    email: ports.email instanceof FakeEmailAdapter ? ports.email : null,
    valkey,
    close: async () => {
      await app.close();
      valkey.disconnect();
    },
  };
};
