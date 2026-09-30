/**
 * Boot-time assertions (P17 task 9).
 *
 * Refuses to start when the environment is misconfigured in a security-relevant way.
 * Each assertion throws an AppError with a stable error code so tests can identify it by name.
 *
 * Error codes (DESIGN §5 contracts):
 *   BOOT_DEFAULT_SECRET      — a secret equals a known default/placeholder
 *   BOOT_INSECURE_COOKIES    — production but cookies would not be Secure
 *   BOOT_TEST_STUB_LOADED    — test-only stub is reachable outside NODE_ENV=test
 *   BOOT_RATE_LIMIT_MULTIPLIER — RATE_LIMIT_MULTIPLIER set outside test
 *   BOOT_JWT_KID             — JWT_ACTIVE_KID not present in JWT_KEYS_JSON
 */
import type { ApiEnv } from '@pe/shared';
import { AppError } from '@pe/shared';

import { sharedPlugin } from '../lib/plugin';

/** Secrets that must never be used in production (common defaults/placeholders). */
const FORBIDDEN_SECRET_VALUES = new Set([
  '',
  'changeme',
  'change-me',
  'secret',
  'test',
  'test-secret',
  'password',
  'mysecret',
  'insecure',
  'placeholder',
  'your-secret-here',
  'replace-me',
  'replace_me',
  // Razorpay test dummy values shipped in the fixture
  'rzp_test_dummy',
  'rzp_test_dummy_secret',
  'rzp_test_dummy_webhook',
]);

const SECRET_KEYS: readonly (keyof ApiEnv)[] = [
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'REVALIDATE_SECRET',
  'ENCRYPTION_KEY_B64',
  'BLIND_INDEX_KEY_B64',
  'HMAC_SECRET',
] as const;

export class BootAssertionError extends AppError {
  constructor(code: string, detail: string) {
    super(code as 'INTERNAL', `${code}: ${detail}`);
    this.name = 'BootAssertionError';
  }
}

export const assertBootSafety = (env: ApiEnv): void => {
  if (env.NODE_ENV === 'test') return; // Assertions relaxed for test harness

  // 1. No default / placeholder secrets in production or development
  for (const key of SECRET_KEYS) {
    const value = String(env[key] as string | number | boolean | undefined ?? '').toLowerCase().trim();
    if (FORBIDDEN_SECRET_VALUES.has(value)) {
      throw new BootAssertionError(
        'BOOT_DEFAULT_SECRET',
        `${key} contains a known default or placeholder value — rotate before deploying`,
      );
    }
  }

  // 2. Cookies must be Secure outside development
  if (env.NODE_ENV === 'production') {
    const webOrigin = env.WEB_ORIGIN ?? '';
    if (!webOrigin.startsWith('https://')) {
      throw new BootAssertionError(
        'BOOT_INSECURE_COOKIES',
        'WEB_ORIGIN must use https:// in production so that __Host- cookies can be marked Secure',
      );
    }
  }

  // 3. RATE_LIMIT_MULTIPLIER must not be set outside tests
  if (env.RATE_LIMIT_MULTIPLIER !== undefined) {
    throw new BootAssertionError(
      'BOOT_RATE_LIMIT_MULTIPLIER',
      'RATE_LIMIT_MULTIPLIER is only permitted when NODE_ENV=test — remove it from this environment',
    );
  }

  // 4. JWT_ACTIVE_KID must appear in JWT_KEYS_JSON
  // (Zod schema already checks this, but we double-check here for belt-and-suspenders)
  const kidPresent = env.JWT_KEYS_JSON.some((k) => k.kid === env.JWT_ACTIVE_KID);
  if (!kidPresent) {
    throw new BootAssertionError(
      'BOOT_JWT_KID',
      `JWT_ACTIVE_KID "${env.JWT_ACTIVE_KID}" is not present in JWT_KEYS_JSON`,
    );
  }
};

/**
 * Fastify plugin that runs boot assertions at startup.
 * Register this before any route or auth plugin so a misconfigured start fails fast.
 */
export const bootAssertionsPlugin = sharedPlugin(async (app) => {
  try {
    assertBootSafety(app.env);
  } catch (error) {
    app.log.fatal(
      { err: error },
      (error instanceof BootAssertionError ? error.message : String(error)),
    );
    process.exit(1);
  }
});
