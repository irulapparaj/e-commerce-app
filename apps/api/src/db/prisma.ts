import { PrismaClient } from '@prisma/client';

import type { KeyProvider } from '../ports/key-provider';

import { createEncryptionExtension } from './encryption-extension';

export type PrismaRaw = PrismaClient;

export interface DbOptions {
  /** Tests provoke constraint failures on purpose and pass `true` to keep output readable. */
  readonly quiet?: boolean;
}

export const createPrismaRaw = (databaseUrl: string, options: DbOptions = {}): PrismaRaw =>
  new PrismaClient({ datasourceUrl: databaseUrl, log: options.quiet ? [] : ['warn', 'error'] });

/**
 * Extended client used by every application module. `raw` shares the same connection pool but
 * returns ciphertext for encrypted columns; only exports and encryption tests may use it.
 */
export const createDb = (databaseUrl: string, keys: KeyProvider, options: DbOptions = {}) => {
  const raw = createPrismaRaw(databaseUrl, options);
  const prisma = raw.$extends(createEncryptionExtension(keys));
  return { prisma, raw };
};

export type Db = ReturnType<typeof createDb>;
export type PrismaDb = Db['prisma'];
/** Client handed to interactive `$transaction` callbacks on the extended client. */
export type PrismaTx = Parameters<Parameters<PrismaDb['$transaction']>[0]>[0];
