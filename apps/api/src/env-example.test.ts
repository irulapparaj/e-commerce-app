import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiEnvSchema, webEnvSchema } from '@pe/shared';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const exampleKeys = (): ReadonlySet<string> =>
  new Set(
    readFileSync(resolve(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.slice(0, line.indexOf('='))),
  );

describe('.env.example', () => {
  it('lists every key consumed by the API and web env schemas', () => {
    const listed = exampleKeys();
    const expected = [...Object.keys(apiEnvSchema.shape), ...Object.keys(webEnvSchema.shape)];
    const missing = expected.filter((key) => !listed.has(key));

    expect(missing).toEqual([]);
  });

  it('does not list keys that no schema consumes', () => {
    const known = new Set([
      ...Object.keys(apiEnvSchema.shape),
      ...Object.keys(webEnvSchema.shape),
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
      'MINIO_ROOT_USER',
      'MINIO_ROOT_PASSWORD',
    ]);
    const unknown = [...exampleKeys()].filter((key) => !known.has(key));

    expect(unknown).toEqual([]);
  });
});
