import { describe, expect, it } from 'vitest';

import { contactFormSchema, sellerInquirySchema } from './schemas';

describe('contactFormSchema', () => {
  const valid = {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    subject: 'Order question',
    message: 'I have a question about my recent order.',
  };

  it('accepts a valid contact form', () => {
    expect(contactFormSchema.safeParse(valid).success).toBe(true);
  });

  it('lowercases email', () => {
    const result = contactFormSchema.safeParse({ ...valid, email: 'PRIYA@EXAMPLE.COM' });
    expect(result.success && result.data.email).toBe('priya@example.com');
  });

  it('rejects message shorter than 10 chars', () => {
    expect(contactFormSchema.safeParse({ ...valid, message: 'Hi' }).success).toBe(false);
  });

  it('accepts honeypot when empty (human)', () => {
    expect(contactFormSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
  });

  it('accepts honeypot when filled (bot detection is done in handler for silent 200)', () => {
    expect(contactFormSchema.safeParse({ ...valid, website: 'http://spam.example' }).success).toBe(true);
  });

  it('rejects message longer than 2000 chars', () => {
    expect(contactFormSchema.safeParse({ ...valid, message: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('sellerInquirySchema', () => {
  const valid = {
    businessName: 'Tulsi Traders',
    contactName: 'Ramesh Kumar',
    email: 'ramesh@tulsitraders.com',
    phone: '+917890123456',
    productCategories: 'Agarbatti, Camphor',
    message: 'We manufacture high quality agarbatti sticks in Mysore.',
  };

  it('accepts a valid seller inquiry', () => {
    expect(sellerInquirySchema.safeParse(valid).success).toBe(true);
  });

  it('lowercases email', () => {
    const result = sellerInquirySchema.safeParse({ ...valid, email: 'RAMESH@TULSITRADERS.COM' });
    expect(result.success && result.data.email).toBe('ramesh@tulsitraders.com');
  });

  it('rejects invalid phone format', () => {
    expect(sellerInquirySchema.safeParse({ ...valid, phone: 'not-a-phone' }).success).toBe(false);
  });

  it('accepts gstin as optional', () => {
    const withGstin = sellerInquirySchema.safeParse({ ...valid, gstin: '29ABCDE1234F1Z5' });
    expect(withGstin.success).toBe(true);
  });
});
