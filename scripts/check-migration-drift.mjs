#!/usr/bin/env node
// Fails when the Prisma schema and the committed migrations disagree, ignoring the documented
// allow-list of hand-written objects Prisma cannot model (P02 §4.10).
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ALLOWED_STATEMENTS = [
  // Generated column: Prisma reports the generation expression as an unknown default.
  'ALTER TABLE "product" ALTER COLUMN "search_vector" DROP DEFAULT;',
];

const apiDir = resolve(new URL('../apps/api', import.meta.url).pathname);
const shadowUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowUrl) {
  console.error('SHADOW_DATABASE_URL is required (an empty database the check can reset)');
  process.exit(2);
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    './prisma/migrations',
    '--to-schema-datamodel',
    './prisma/schema.prisma',
    '--shadow-database-url',
    shadowUrl,
    '--script',
  ],
  { cwd: apiDir, encoding: 'utf8', env: process.env },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const statements = result.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(
    (line) => line !== '' && !line.startsWith('--') && !line.startsWith('Loaded Prisma config'),
  )
  .filter((line) => !ALLOWED_STATEMENTS.includes(line));

if (statements.length > 0) {
  console.error('Migration drift detected. Statements not covered by the allow-list:');
  for (const statement of statements) console.error(`  ${statement}`);
  process.exit(1);
}

console.log('No migration drift (allow-listed: %d statement(s))', ALLOWED_STATEMENTS.length);
