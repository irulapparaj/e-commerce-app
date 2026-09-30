import { emailSchema, uuidSchema } from '@pe/shared';
import { z } from 'zod';

export const OTP_PATTERN = /^\d{6}$/;
export const TOTP_PATTERN = /^\d{6}$/;
export const RECOVERY_CODE_PATTERN = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

export const sendOtpBody = z.strictObject({ email: emailSchema });

export const verifyOtpBody = z.strictObject({
  email: emailSchema,
  nonce: uuidSchema,
  otp: z.string().regex(OTP_PATTERN),
});

export const refreshBody = z.strictObject({ refreshToken: z.string().min(32).max(128) });

export const mfaVerifyBody = z.strictObject({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => TOTP_PATTERN.test(value) || RECOVERY_CODE_PATTERN.test(value),
      'Enter a 6-digit code or a recovery code',
    ),
});

export const stepUpBody = z.strictObject({ code: z.string().regex(TOTP_PATTERN) });

export const sessionIdParams = z.strictObject({ id: uuidSchema });

export const createStaffBody = z.strictObject({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(['ADMIN', 'STAFF']),
});

export type SendOtpBody = z.infer<typeof sendOtpBody>;
export type VerifyOtpBody = z.infer<typeof verifyOtpBody>;
export type CreateStaffBody = z.infer<typeof createStaffBody>;
