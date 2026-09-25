import { z } from 'zod';

import { MAX_CART_QUANTITY, STATE_CODES } from '../constants';

export const PINCODE_PATTERN = /^\d{6}$/;
export const PHONE_PATTERN = /^[6-9]\d{9}$/;
export const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;
export const MAX_EMAIL_LENGTH = 254;

export const pincodeSchema = z.string().regex(PINCODE_PATTERN, 'PIN code must be 6 digits');

export const phoneSchema = z
  .string()
  .regex(PHONE_PATTERN, 'Phone must be a 10-digit Indian mobile number');

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, 'Slug may contain only lowercase letters, digits and hyphens (max 120)');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH)
  .pipe(z.email('Invalid email address'));

export const quantitySchema = z.number().int().min(1).max(MAX_CART_QUANTITY);

export const uuidSchema = z.uuid();

export const stateCodeSchema = z.enum(STATE_CODES as [string, ...string[]]);

export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
