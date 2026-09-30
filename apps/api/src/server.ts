import { apiEnvSchema, loadEnv } from '@pe/shared';

import { buildApp } from './app';
import { createDb } from './db/prisma';
import { connectValkey, createValkeyClient } from './lib/valkey';
import { createPorts } from './ports';
import { EnvKeyProvider } from './ports/adapters/env-key-provider';

const SHUTDOWN_GRACE_MS = 10_000;

const main = async (): Promise<void> => {
  const env = loadEnv(apiEnvSchema);
  const keys = EnvKeyProvider.fromEnv(env);
  const db = createDb(env.DATABASE_URL, keys);
  // B1: valkey must be created before ports so adapters that need it (e.g. shiprocket) receive it
  const valkey = createValkeyClient(env.VALKEY_URL, (error) => {
    console.error(`valkey: ${error.message}`);
  });
  const ports = createPorts(env, { keys }, { prismaRaw: db.raw, valkey });
  const extraOptions =
    env.NODE_ENV === 'test'
      ? { now: (await import('./modules/test-hooks/clock')).getTestNow }
      : {};
  const app = await buildApp({ env, ports, valkey, db, ...extraOptions });

  if (!(await connectValkey(valkey)))
    app.log.warn('valkey unavailable at boot; readiness will report it');

  const shutdown = (signal: string): void => {
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    void app
      .close()
      .then(() => valkey.quit())
      .finally(() => {
        clearTimeout(timer);
        process.exit(0);
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
