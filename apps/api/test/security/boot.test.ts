/**
 * Boot assertions test (P17 task 9).
 *
 * Verifies that `assertBootSafety` throws the correct named errors for each bad configuration,
 * and that the app starts normally when the environment is valid.
 */
import { describe, expect, it } from 'vitest';

import {
  assertBootSafety,
  BootAssertionError,
} from '../../src/plugins/boot-assertions';
import { buildTestEnv } from '../helpers/env';

const env = () => buildTestEnv();

describe('boot assertions', () => {
  it('passes for a valid test environment', () => {
    // NODE_ENV=test so all assertions are skipped
    expect(() => assertBootSafety(env())).not.toThrow();
  });

  describe('production environment', () => {
    const prodBase = () =>
      buildTestEnv({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://example.com',
        EMAIL_ADAPTER: 'smtp',
        // Remove test-only env vars that the schema rejects in production
        RATE_LIMIT_MULTIPLIER: undefined,
        OTP_EMAIL_RATE_LIMIT: undefined,
        OTP_IP_RATE_LIMIT: undefined,
        // Override dangerous defaults so only the tested key triggers
        RAZORPAY_KEY_SECRET: 'live_secret_that_is_long_enough_to_pass',
        RAZORPAY_WEBHOOK_SECRET: 'live_webhook_secret_long_enough_for_check',
        REVALIDATE_SECRET: 'live_revalidate_secret_16chars_minimum',
        HMAC_SECRET: 'live_hmac_secret_that_is_at_least_32_bytes_long!!!',
      });

    it('BOOT_DEFAULT_SECRET — RAZORPAY_KEY_SECRET is a placeholder', () => {
      const e = prodBase();
      // Inject the forbidden value directly (bypass schema validation by casting)
      const bad = { ...e, RAZORPAY_KEY_SECRET: 'changeme' };
      let error: unknown;
      try {
        assertBootSafety(bad);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BootAssertionError);
      expect((error as BootAssertionError).message).toContain('BOOT_DEFAULT_SECRET');
    });

    it('BOOT_INSECURE_COOKIES — WEB_ORIGIN is http in production', () => {
      const base = prodBase();
      const bad = { ...base, WEB_ORIGIN: 'http://example.com' };
      let error: unknown;
      try {
        assertBootSafety(bad);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BootAssertionError);
      expect((error as BootAssertionError).message).toContain('BOOT_INSECURE_COOKIES');
    });

    it('BOOT_RATE_LIMIT_MULTIPLIER — RATE_LIMIT_MULTIPLIER set outside test', () => {
      const base = prodBase();
      const bad = { ...base, RATE_LIMIT_MULTIPLIER: 10 };
      let error: unknown;
      try {
        assertBootSafety(bad);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BootAssertionError);
      expect((error as BootAssertionError).message).toContain('BOOT_RATE_LIMIT_MULTIPLIER');
    });

    it('passes with all secure production values', () => {
      expect(() => assertBootSafety(prodBase())).not.toThrow();
    });
  });
});
