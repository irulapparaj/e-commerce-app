import { createHash } from 'node:crypto';

import type { ApiEnv } from '@pe/shared';
import type { FastifyServerOptions } from 'fastify';

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'otp',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'mfaToken',
  'csrfToken',
  'secret',
  'signature',
  'phone',
  'line1',
  'line2',
  'totpSecret',
  'recoveryCodes',
];

const wildcardPaths = (key: string): string[] => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`];

export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((key) =>
    key.includes('-') ? [`*["${key}"]`, `*.*["${key}"]`] : wildcardPaths(key),
  ),
];

const EMAIL_KEYS: ReadonlySet<string> = new Set(['email', 'to', 'from']);
const HASH_PREFIX_LENGTH = 8;
const MAX_DEPTH = 8;

export const hashEmail = (email: string): string =>
  `sha256:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, HASH_PREFIX_LENGTH)}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Returns a copy of a plain log object with every `email`-like string replaced by a short hash. */
export const scrubLogObject = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => scrubLogObject(item, depth + 1));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (EMAIL_KEYS.has(key) && typeof item === 'string') return [key, hashEmail(item)];
      return [key, scrubLogObject(item, depth + 1)];
    }),
  );
};

export type LoggerOptions = Exclude<FastifyServerOptions['logger'], boolean | undefined>;

export const buildLoggerOptions = (env: Pick<ApiEnv, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions => ({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
  formatters: {
    log: (object) => scrubLogObject(object) as Record<string, unknown>,
  },
});
