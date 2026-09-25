import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';
import { searchMailpit } from '../helpers/mailpit';

describe('SmtpEmailAdapter against Mailpit', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp({ env: { EMAIL_ADAPTER: 'smtp' } });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('delivers a message that Mailpit lists by subject', async () => {
    const subject = `P01 smoke ${randomUUID()}`;

    const { messageId } = await testApp.ports.email.send({
      to: 'customer@example.test',
      subject,
      text: 'plain body',
      html: '<p>html body</p>',
      headers: { 'X-PE-Test': '1' },
    });
    const found = await searchMailpit(subject);

    expect(messageId).toBeTruthy();
    expect(found).toHaveLength(1);
    expect(found[0]?.To[0]?.Address).toBe('customer@example.test');
  });
});
