import { STATE_CODES } from '@pe/shared';
import { z } from 'zod';

export const addressCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().regex(/^[6-9]\d{9}$/),
    line1: z.string().min(1).max(120),
    line2: z.string().max(120).nullish().transform((v) => v ?? null),
    city: z.string().min(1).max(80),
    state: z.enum(STATE_CODES as [string, ...string[]]),
    pincode: z.string().regex(/^\d{6}$/),
  })
  .strict();

export type AddressCreateInput = z.infer<typeof addressCreateSchema>;

export const addressIdParam = z.strictObject({ addressId: z.uuid() });
