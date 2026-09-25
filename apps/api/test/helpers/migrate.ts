import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRISMA_BIN = resolve(API_ROOT, 'node_modules/.bin/prisma');
const MIGRATIONS_DIR = resolve(API_ROOT, 'prisma/migrations');

/** Applies committed migrations once per test run. A no-op until P02 adds the schema. */
export const migrateTestDatabase = async (databaseUrl: string): Promise<void> => {
  if (!existsSync(MIGRATIONS_DIR)) return;
  execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
};
