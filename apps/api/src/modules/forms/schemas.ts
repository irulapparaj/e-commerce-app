import { z } from 'zod';

export const contactFormSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().toLowerCase(),
  subject: z.string().trim().min(1).max(120),
  message: z.string().trim().min(10).max(2000),
  orderNumber: z.string().trim().max(40).optional(),
  /** Honeypot — absent or empty for humans; any value signals a bot (checked in handler, not schema) */
  website: z.string().optional(),
});

export const sellerInquirySchema = z.strictObject({
  businessName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(80),
  email: z.string().email().toLowerCase(),
  phone: z.string().regex(/^\+?[0-9\s\-().]{7,20}$/),
  gstin: z.string().trim().max(15).optional(),
  productCategories: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(2000),
  /** Honeypot — absent or empty for humans; any value signals a bot (checked in handler, not schema) */
  website: z.string().optional(),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type SellerInquiryInput = z.infer<typeof sellerInquirySchema>;
