/**
 * Mass assignment test (P17 task 5).
 *
 * Verifies that all route schemas use `.strict()` (extra fields are rejected with 400)
 * and that elevated-privilege fields cannot be injected through request bodies.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';

const PRIVILEGE_ESCALATION_FIELDS: Record<string, unknown> = {
  role: 'ADMIN',
  isAdmin: true,
  price: 1,
  stock: 9999,
  userId: '00000000-0000-0000-0000-000000000099',
  isDisabled: false,
  id: '00000000-0000-0000-0000-000000000099',
  createdAt: '1970-01-01T00:00:00Z',
  updatedAt: '1970-01-01T00:00:00Z',
};

describe('mass assignment prevention', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('send-otp schema rejects extra fields (strict mode)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/send-otp',
      payload: {
        email: 'test@example.com',
        ...PRIVILEGE_ESCALATION_FIELDS,
      },
    });
    // strict() schema → extra fields cause 400
    expect(res.statusCode).toBe(400);
  });

  it('verify-otp schema rejects extra fields', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp',
      payload: {
        email: 'test@example.com',
        nonce: 'test-nonce',
        otp: '123456',
        ...PRIVILEGE_ESCALATION_FIELDS,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('newsletter subscribe schema rejects extra fields', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/newsletter/subscribe',
      payload: {
        email: 'test@example.com',
        ...PRIVILEGE_ESCALATION_FIELDS,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('contact form schema rejects extra fields', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/forms/contact',
      payload: {
        name: 'Test User',
        email: 'test@example.com',
        message: 'Hello',
        ...PRIVILEGE_ESCALATION_FIELDS,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
