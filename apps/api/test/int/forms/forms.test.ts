import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { resetDb } from '../../helpers/db';

const VALID_CONTACT = {
  name: 'Priya Sharma',
  email: 'priya@example.test',
  subject: 'Order question',
  message: 'I have a question about my recent order. Please help me.',
};

const VALID_SELLER = {
  businessName: 'Tulsi Traders',
  contactName: 'Ramesh Kumar',
  email: 'ramesh@example.test',
  phone: '+917890123456',
  productCategories: 'Agarbatti, Camphor',
  message: 'We manufacture high quality agarbatti sticks in Mysore.',
};

describe('forms routes', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    testApp.email?.clear();
  });

  describe('POST /api/v1/forms/contact', () => {
    it('returns 200 with a PE-C ticket id and sends two emails', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/contact',
        payload: VALID_CONTACT,
        remoteAddress: '10.1.1.1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { ticketId: string } }>();
      expect(body.data.ticketId).toMatch(/^PE-C-\d{8}-[A-Z2-7]{6}$/);

      const emails = [...(testApp.email?.messages ?? [])];
      expect(emails).toHaveLength(2);

      const inbox = emails.find((m) => m.subject.includes('[Contact]'));
      expect(inbox).toBeDefined();
      expect(inbox?.subject).toContain(body.data.ticketId);

      const ack = emails.find((m) => m.to === VALID_CONTACT.email);
      expect(ack).toBeDefined();
      expect(ack?.subject).toContain(body.data.ticketId);
    });

    it('honeypot filled returns 200 with a fake ticket but sends no emails', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/contact',
        payload: { ...VALID_CONTACT, website: 'https://spambot.example.com' },
        remoteAddress: '10.1.1.2',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { ticketId: string } }>();
      expect(body.data.ticketId).toMatch(/^PE-C-/);

      expect(testApp.email?.messages ?? []).toHaveLength(0);
    });

    it('returns 429 after 5 submissions from the same IP', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await testApp.app.inject({
          method: 'POST',
          url: '/api/v1/forms/contact',
          payload: VALID_CONTACT,
          remoteAddress: '10.1.1.3',
        });
        expect(res.statusCode).toBe(200);
      }

      const blocked = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/contact',
        payload: VALID_CONTACT,
        remoteAddress: '10.1.1.3',
      });
      expect(blocked.statusCode).toBe(429);
    });

    it('HTML-encodes special characters in the internal email body', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/contact',
        payload: {
          ...VALID_CONTACT,
          message: '<script>alert("xss")</script> normal message content here',
        },
        remoteAddress: '10.1.1.4',
      });

      expect(res.statusCode).toBe(200);

      const inbox = [...(testApp.email?.messages ?? [])].find((m) => m.subject.includes('[Contact]'));
      expect(inbox).toBeDefined();
      expect(inbox?.html ?? '').not.toContain('<script>');
    });

    it('rejects a contact form with message shorter than 10 chars', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/contact',
        payload: { ...VALID_CONTACT, message: 'Short' },
        remoteAddress: '10.1.1.5',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/forms/seller-inquiry', () => {
    it('returns 200 with a PE-S ticket id and sends two emails', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/seller-inquiry',
        payload: VALID_SELLER,
        remoteAddress: '10.2.1.1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { ticketId: string } }>();
      expect(body.data.ticketId).toMatch(/^PE-S-\d{8}-[A-Z2-7]{6}$/);

      const emails = [...(testApp.email?.messages ?? [])];
      expect(emails).toHaveLength(2);

      const inbox = emails.find((m) => m.subject.includes('[Seller Inquiry]'));
      expect(inbox?.subject).toContain(body.data.ticketId);

      const ack = emails.find((m) => m.to === VALID_SELLER.email);
      expect(ack?.subject).toContain(body.data.ticketId);
    });

    it('honeypot filled returns 200 but sends no emails', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/seller-inquiry',
        payload: { ...VALID_SELLER, website: 'http://spam.example' },
        remoteAddress: '10.2.1.2',
      });

      expect(res.statusCode).toBe(200);
      expect(testApp.email?.messages ?? []).toHaveLength(0);
    });

    it('rate limits after 3 requests from the same IP', async () => {
      for (let i = 0; i < 3; i++) {
        await testApp.app.inject({
          method: 'POST',
          url: '/api/v1/forms/seller-inquiry',
          payload: VALID_SELLER,
          remoteAddress: '10.2.1.3',
        });
      }

      const blocked = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/forms/seller-inquiry',
        payload: VALID_SELLER,
        remoteAddress: '10.2.1.3',
      });
      expect(blocked.statusCode).toBe(429);
    });
  });
});
