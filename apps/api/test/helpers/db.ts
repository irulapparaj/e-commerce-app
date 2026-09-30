import { createDb, type PrismaDb, type PrismaRaw } from '../../src/db/prisma';
import { EnvKeyProvider } from '../../src/ports/adapters/env-key-provider';

import { buildTestEnv } from './env';

let cached: { prisma: PrismaDb; raw: PrismaRaw; keys: EnvKeyProvider } | undefined;

const connection = () => {
  if (cached === undefined) {
    const env = buildTestEnv();
    const keys = EnvKeyProvider.fromEnv(env);
    const { prisma, raw } = createDb(env.DATABASE_URL, keys, { quiet: true });
    cached = { prisma, raw, keys };
  }
  return cached;
};

/** Encrypting client bound to the Testcontainers database (or TEST_DATABASE_URL). */
export const getPrisma = (): PrismaDb => connection().prisma;

/** Raw client without the encryption extension — only for asserting ciphertext at rest. */
export const getPrismaRaw = (): PrismaRaw => connection().raw;

export const getTestKeys = (): EnvKeyProvider => connection().keys;

interface TableRow {
  readonly tablename: string;
}

interface SequenceRow {
  readonly sequencename: string;
}

/** TRUNCATE every application table and restart order-number sequences; runs in well under 200 ms. */
export const resetDb = async (): Promise<void> => {
  const raw = getPrismaRaw();
  const tables = await raw.$queryRaw<TableRow[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await raw.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
  const sequences = await raw.$queryRaw<SequenceRow[]>`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename LIKE 'order_number_seq_%'`;
  for (const { sequencename } of sequences)
    await raw.$executeRawUnsafe(`ALTER SEQUENCE "${sequencename}" RESTART`);
};

export const disconnectDb = async (): Promise<void> => {
  if (cached === undefined) return;
  await cached.raw.$disconnect();
  cached = undefined;
};

export { seedMinimal, runSeed, ADMIN_EMAIL } from '../../prisma/seed-runner';
