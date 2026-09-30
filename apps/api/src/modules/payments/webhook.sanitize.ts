import type { Prisma } from '@prisma/client';

/**
 * Review fix C-4: raw webhook payloads carried customer PII (email, contact, VPA, card and
 * bank descriptors) into `webhook_event.payload`, outside every encryption, export, erase and
 * retention leg. Payloads are now scrubbed before they are written; handlers only ever need
 * ids, amounts and statuses, all of which survive the scrub.
 */
export const REDACTED_PLACEHOLDER = '[redacted]';

/** Keys removed at any depth. Covers Razorpay payment/refund entities and courier payloads. */
const REDACTED_KEYS: ReadonlySet<string> = new Set([
  'email',
  'contact',
  'phone',
  'vpa',
  'card',
  'card_id',
  'bank',
  'wallet',
  'customer_id',
  'token_id',
  'notes',
  'customer_name',
  'customer_address',
  'consignee',
]);

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        REDACTED_KEYS.has(key) ? REDACTED_PLACEHOLDER : sanitizeValue(entry),
      ]),
    );
  }
  return value;
};

/** Idempotent deep scrub of a webhook body for storage; safe on any JSON shape. */
export const sanitizeWebhookPayload = (body: unknown): Prisma.InputJsonValue =>
  sanitizeValue(body) as Prisma.InputJsonValue;
