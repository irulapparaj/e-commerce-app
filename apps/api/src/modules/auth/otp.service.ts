import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import type Redis from 'ioredis';

import type { RateLimiter } from '../../plugins/rate-limit';
import type { EmailPort } from '../../ports/email';
import type { KeyProvider } from '../../ports/key-provider';

import { otpEmail } from './emails';

export const OTP_TTL_SECONDS = 600;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MIN_RESPONSE_MS = 250;
export const OTP_SEND_LIMITS = {
  perEmail: { limit: 3, windowSeconds: 600 },
  perIp: { limit: 10, windowSeconds: 3600 },
} as const;
const OTP_DIGITS = 6;
const OTP_MAX = 10 ** OTP_DIGITS;

export const generateOtp = (): string => String(randomInt(0, OTP_MAX)).padStart(OTP_DIGITS, '0');

export const hashEmailForKey = (email: string): string =>
  createHash('sha256').update(email).digest('hex').slice(0, 32);

export const otpKey = (email: string, nonce: string): string =>
  `otp:${hashEmailForKey(email)}:${nonce}`;

/** Constant-time comparison of two hex digests; unequal lengths short-circuit without leaking content. */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface OtpServiceDeps {
  readonly valkey: Redis;
  readonly keys: KeyProvider;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiter;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface OtpService {
  issue(email: string, ip: string): Promise<{ nonce: string }>;
  verify(email: string, nonce: string, otp: string): Promise<boolean>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createOtpService = ({
  valkey,
  keys,
  email,
  rateLimiter,
  now = Date.now,
  sleep = defaultSleep,
}: OtpServiceDeps): OtpService => {
  const digest = (address: string, nonce: string, otp: string): string =>
    keys.blindIndex(`otp:${address}:${nonce}:${otp}`);

  const padResponse = async (startedAt: number): Promise<void> => {
    const remaining = OTP_MIN_RESPONSE_MS - (now() - startedAt);
    if (remaining > 0) await sleep(remaining);
  };

  const issue: OtpService['issue'] = async (address, ip) => {
    const startedAt = now();
    await rateLimiter.consume([
      { key: `otp-send:email:${hashEmailForKey(address)}`, ...OTP_SEND_LIMITS.perEmail },
      { key: `otp-send:ip:${ip}`, ...OTP_SEND_LIMITS.perIp },
    ]);
    const otp = generateOtp();
    const nonce = randomUUID();
    const key = otpKey(address, nonce);
    await valkey.hset(key, { hmac: digest(address, nonce, otp), attempts: 0 });
    await valkey.expire(key, OTP_TTL_SECONDS);
    await email.send({ to: address, ...otpEmail(otp) });
    await padResponse(startedAt);
    return { nonce };
  };

  const verify: OtpService['verify'] = async (address, nonce, otp) => {
    const key = otpKey(address, nonce);
    const record = await valkey.hgetall(key);
    if (record.hmac === undefined) return false;
    if (safeEqual(record.hmac, digest(address, nonce, otp))) {
      await valkey.del(key);
      return true;
    }
    const attempts = await valkey.hincrby(key, 'attempts', 1);
    if (attempts >= OTP_MAX_ATTEMPTS) await valkey.del(key);
    return false;
  };

  return { issue, verify };
};
