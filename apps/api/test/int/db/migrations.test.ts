import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { getPrismaRaw } from '../../helpers/db';

const API_ROOT = resolve(import.meta.dirname, '../../..');
const ROOT = resolve(API_ROOT, '../..');
const PRISMA_BIN = resolve(API_ROOT, 'node_modules/.bin/prisma');

const shadowUrl = (databaseUrl: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname}_shadow`;
  return url.toString();
};

describe('migrations', () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
  const shadow = shadowUrl(databaseUrl);

  beforeAll(async () => {
    const raw = getPrismaRaw();
    const name = new URL(shadow).pathname.slice(1);
    await raw.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await raw.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  });

  it('applying the committed migrations twice is a no-op', () => {
    const output = execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    });

    expect(output).toContain('No pending migrations');
  });

  it('has no drift between schema.prisma and the migrations beyond the allow-list', () => {
    const output = execFileSync('node', [resolve(ROOT, 'scripts/check-migration-drift.mjs')], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl, SHADOW_DATABASE_URL: shadow },
      encoding: 'utf8',
    });

    expect(output).toContain('No migration drift');
  });

  it('created the extensions, sequences and roles', async () => {
    const raw = getPrismaRaw();
    const extensions = await raw.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    const sequences = await raw.$queryRaw<
      { sequencename: string }[]
    >`SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`;
    const roles = await raw.$queryRaw<
      { rolname: string }[]
    >`SELECT rolname FROM pg_roles WHERE rolname IN ('app_rw', 'app_migrate')`;

    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(['pg_trgm', 'pgcrypto']),
    );
    expect(sequences.map((s) => s.sequencename)).toEqual(
      expect.arrayContaining(['order_number_seq_2026', 'order_number_seq_2027']),
    );
    expect(roles.map((r) => r.rolname).sort()).toEqual(['app_migrate', 'app_rw']);
  });
});
