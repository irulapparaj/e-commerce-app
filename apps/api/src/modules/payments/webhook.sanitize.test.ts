import { describe, expect, it } from 'vitest';

import { REDACTED_PLACEHOLDER, sanitizeWebhookPayload } from './webhook.sanitize';

const capturedEvent = {
  id: 'evt_1',
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_1',
        order_id: 'order_1',
        status: 'captured',
        amount: 59900,
        email: 'customer@example.com',
        contact: '+919876543210',
        vpa: 'customer@upi',
        card: { last4: '4242', network: 'Visa' },
        notes: { address: '12 Temple St' },
      },
    },
  },
};

describe('sanitizeWebhookPayload', () => {
  it('redacts PII keys at any depth (C-4)', () => {
    const scrubbed = sanitizeWebhookPayload(capturedEvent) as typeof capturedEvent;
    const entity = scrubbed.payload.payment.entity;
    expect(entity.email).toBe(REDACTED_PLACEHOLDER);
    expect(entity.contact).toBe(REDACTED_PLACEHOLDER);
    expect(entity.vpa).toBe(REDACTED_PLACEHOLDER);
    expect(entity.card).toBe(REDACTED_PLACEHOLDER);
    expect(entity.notes).toBe(REDACTED_PLACEHOLDER);
  });

  it('keeps everything the handlers and reconcile sweep need', () => {
    const scrubbed = sanitizeWebhookPayload(capturedEvent) as typeof capturedEvent;
    expect(scrubbed.id).toBe('evt_1');
    expect(scrubbed.event).toBe('payment.captured');
    expect(scrubbed.payload.payment.entity.id).toBe('pay_1');
    expect(scrubbed.payload.payment.entity.order_id).toBe('order_1');
    expect(scrubbed.payload.payment.entity.amount).toBe(59900);
    expect(scrubbed.payload.payment.entity.status).toBe('captured');
  });

  it('keeps refund entity ids and amounts intact', () => {
    const refundEvent = {
      id: 'evt_2',
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 5000 } } },
    };
    expect(sanitizeWebhookPayload(refundEvent)).toEqual(refundEvent);
  });

  it('is idempotent and safe on arrays, scalars and null', () => {
    const once = sanitizeWebhookPayload(capturedEvent);
    expect(sanitizeWebhookPayload(once)).toEqual(once);
    expect(sanitizeWebhookPayload([{ email: 'x@y.z' }])).toEqual([{ email: REDACTED_PLACEHOLDER }]);
    expect(sanitizeWebhookPayload('plain')).toBe('plain');
    expect(sanitizeWebhookPayload(null)).toBeNull();
  });

  it('scrubs courier consignee details', () => {
    const shiprocket = { awb: 'AWB1', current_status: 'DELIVERED', phone: '+91900', consignee: { name: 'X' } };
    const scrubbed = sanitizeWebhookPayload(shiprocket) as Record<string, unknown>;
    expect(scrubbed.awb).toBe('AWB1');
    expect(scrubbed.phone).toBe(REDACTED_PLACEHOLDER);
    expect(scrubbed.consignee).toBe(REDACTED_PLACEHOLDER);
  });
});
