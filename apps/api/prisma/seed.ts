import { apiEnvSchema, loadEnv } from '@pe/shared';

import { createDb } from '../src/db/prisma';
import { EnvKeyProvider } from '../src/ports/adapters/env-key-provider';

import { runSeed } from './seed-runner';

const main = async (): Promise<void> => {
  const env = loadEnv(apiEnvSchema);
  const { prisma, raw } = createDb(env.DATABASE_URL, EnvKeyProvider.fromEnv(env));
  try {
    const summary = await runSeed(prisma);
    console.warn(`seeded ${summary.categories} categories and ${summary.products} products`);
  } finally {
    await raw.$disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
