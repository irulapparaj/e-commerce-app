import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiEnvSchema, formatEnvIssues, loadEnv, parseEnv, webEnvSchema } from './env';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const key32 = Buffer.alloc(32, 7).toString('base64');

const validApi: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://pe:pe@localhost:5432/pe',
  VALKEY_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET_MEDIA: 'media',
  S3_BUCKET_IMPORTS: 'imports',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio123',
  S3_FORCE_PATH_STYLE: 'true',
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'Puja Essentials <no-reply@example.test>',
  ENCRYPTION_KEY_B64: key32,
  BLIND_INDEX_KEY_B64: key32,
  JWT_ACTIVE_KID: 'k1',
  JWT_KEYS_JSON: JSON.stringify([{ kid: 'k1', privatePem, publicPem }]),
  API_INTERNAL_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  REVALIDATE_SECRET: 'revalidate-secret-0123456789',
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec',
};

describe('apiEnvSchema', () => {
  it('parses a valid environment with defaults applied', () => {
    const result = parseEnv(apiEnvSchema, validApi);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.PORT).toBe(4000);
    expect(result.env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(result.env.SHIPPING_ADAPTER).toBe('fake');
    expect(result.env.JWT_KEYS_JSON[0]?.kid).toBe('k1');
  });

  it('ignores undeclared keys and empty strings from the source', () => {
    const result = parseEnv(apiEnvSchema, { ...validApi, PATH: '/usr/bin', SENTRY_DSN: '' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.SENTRY_DSN).toBeUndefined();
    expect('PATH' in result.env).toBe(false);
  });

  it('names every missing key', () => {
    const { DATABASE_URL: _db, SMTP_URL: _smtp, ...partial } = validApi;
    const result = parseEnv(apiEnvSchema, partial);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.startsWith('DATABASE_URL: missing'))).toBe(true);
    expect(result.issues.some((i) => i.startsWith('SMTP_URL: missing'))).toBe(true);
  });

  it.each([
    ['ENCRYPTION_KEY_B64', 'short'],
    ['BLIND_INDEX_KEY_B64', '%%%not-base64%%%'],
    ['VALKEY_URL', 'http://localhost'],
    ['JWT_KEYS_JSON', '{not json'],
    ['JWT_ACTIVE_KID', 'unknown'],
    ['S3_FORCE_PATH_STYLE', 'yes'],
    ['RATE_LIMIT_MULTIPLIER', '0'],
  ])('flags invalid %s', (key, value) => {
    const result = parseEnv(apiEnvSchema, { ...validApi, [key]: value });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.startsWith(`${key}:`))).toBe(true);
  });

  it('requires shiprocket credentials when that adapter is selected', () => {
    const result = parseEnv(apiEnvSchema, { ...validApi, SHIPPING_ADAPTER: 'shiprocket' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.filter((i) => i.startsWith('SHIPROCKET_'))).toHaveLength(3);
  });

  it('refuses test-only knobs outside NODE_ENV=test', () => {
    const asProd = {
      ...validApi,
      NODE_ENV: 'production',
      RATE_LIMIT_MULTIPLIER: '10',
      EMAIL_ADAPTER: 'fake',
    };
    const result = parseEnv(apiEnvSchema, asProd);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.startsWith('RATE_LIMIT_MULTIPLIER:'))).toBe(true);
    expect(result.issues.some((i) => i.startsWith('EMAIL_ADAPTER:'))).toBe(true);
  });
});

describe('webEnvSchema', () => {
  it('parses public keys from JSON', () => {
    const result = parseEnv(webEnvSchema, {
      NODE_ENV: 'test',
      API_INTERNAL_URL: 'http://api:4000',
      WEB_ORIGIN: 'http://localhost:3000',
      REVALIDATE_SECRET: 'revalidate-secret-0123456789',
      JWT_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: 'k1', publicPem }]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.JWT_PUBLIC_KEYS_JSON).toHaveLength(1);
  });
});

describe('parseEnv with piped schemas', () => {
  it('reads declared keys through a transform pipe', () => {
    const piped = z.strictObject({ A: z.string() }).transform((v) => ({ a: v.A }));
    const result = parseEnv(piped, { A: 'x', B: 'ignored' });

    expect(result).toEqual({ ok: true, env: { a: 'x' } });
  });
});

describe('loadEnv', () => {
  it('returns the parsed env when valid', () => {
    expect(
      loadEnv(webEnvSchema, {
        API_INTERNAL_URL: 'http://api:4000',
        WEB_ORIGIN: 'http://localhost:3000',
        REVALIDATE_SECRET: 'revalidate-secret-0123456789',
        JWT_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: 'k1', publicPem }]),
      }).NODE_ENV,
    ).toBe('development');
  });

  it('prints the issue list and exits with code 1 when invalid', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    loadEnv(webEnvSchema, {});

    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls[0]?.[0]).toContain('API_INTERNAL_URL: missing');
    exit.mockRestore();
    error.mockRestore();
  });

  it('formats issues as a readable list', () => {
    expect(formatEnvIssues(['A: missing'])).toBe(
      'Environment configuration is invalid:\n  - A: missing',
    );
  });
});
