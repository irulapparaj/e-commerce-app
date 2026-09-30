import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { getPrisma, resetDb } from '../../helpers/db';

const subscribe = (testApp: TestApp, email: string, ip = '10.3.1.1', website?: string) =>
  testApp.app.inject({
    method: 'POST',
    url: '/api/v1/newsletter/subscribe',
    payload: website !== undefined ? { email, website } : { email },
    remoteAddress: ip,
  });

describe('newsletter subscribe', () => {
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
  });

  it('subscribes a new email and persists to the database', async () => {
    const prisma = getPrisma();
    const res = await subscribe(testApp, 'newsletter@example.test');

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { status: string } }>().data.status).toBe('subscribed');

    const row = await prisma.newsletterSubscriber.findFirst({
      where: { status: 'SUBSCRIBED' },
    });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('SUBSCRIBED');
  });

  it('returns already_subscribed on a second call with the same email', async () => {
    await subscribe(testApp, 'repeat@example.test');
    const res = await subscribe(testApp, 'repeat@example.test');

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { status: string } }>().data.status).toBe('already_subscribed');
  });

  it('honeypot filled returns 200 with subscribed but does not persist', async () => {
    const prisma = getPrisma();
    const res = await subscribe(testApp, 'bot@example.test', '10.3.1.2', 'https://spambot.example');

    expect(res.statusCode).toBe(200);

    const row = await prisma.newsletterSubscriber.findFirst({
      where: { source: 'storefront' },
    });
    expect(row).toBeNull();
  });

  it('rate-limits after 5 requests from the same IP', async () => {
    const emails = Array.from({ length: 5 }, (_, i) => `ratelimit${i}@example.test`);
    for (const email of emails) {
      await subscribe(testApp, email, '10.3.1.3');
    }

    const blocked = await subscribe(testApp, 'ratelimit6@example.test', '10.3.1.3');
    expect(blocked.statusCode).toBe(429);
  });

  it('normalises the email to lowercase before storing', async () => {
    const prisma = getPrisma();
    const res = await subscribe(testApp, 'UPPER@EXAMPLE.TEST');

    expect(res.statusCode).toBe(200);
    const lower = await subscribe(testApp, 'upper@example.test');
    expect(lower.json<{ data: { status: string } }>().data.status).toBe('already_subscribed');

    const count = await prisma.newsletterSubscriber.count();
    expect(count).toBe(1);
  });
});
