import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ApiEnv, apiEnvSchema, formatEnvIssues, parseEnv } from '@pe/shared';

import { testKeyPairs } from './keys';

const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/env.test');

export const readEnvFixture = (): Record<string, string> =>
  Object.fromEntries(
    readFileSync(FIXTURE_PATH, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

const containerOverrides = (): Record<string, string> => {
  const map: Record<string, string> = {
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    VALKEY_URL: process.env.TEST_VALKEY_URL ?? '',
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? '',
    S3_ACCESS_KEY: process.env.TEST_S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: process.env.TEST_S3_SECRET_KEY ?? '',
    SMTP_URL: process.env.TEST_SMTP_URL ?? '',
  };
  return Object.fromEntries(Object.entries(map).filter(([, value]) => value !== ''));
};

export const buildTestEnv = (overrides: Record<string, string | undefined> = {}): ApiEnv => {
  const merged: Record<string, string> = {
    ...readEnvFixture(),
    ...containerOverrides(),
    JWT_KEYS_JSON: JSON.stringify(testKeyPairs()),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const result = parseEnv(apiEnvSchema, merged);
  if (!result.ok) throw new Error(formatEnvIssues(result.issues));
  return result.env;
};
