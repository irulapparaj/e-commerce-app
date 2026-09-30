import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures';
import { getSubject } from './subjects';
import { TEMPLATES, type TemplateName } from './templates';

describe('getSubject', () => {
  const templateNames = Object.keys(TEMPLATES) as TemplateName[];

  it('returns a subject for every template', () => {
    for (const name of templateNames) {
      const fixture = FIXTURES[name];
      const subject = getSubject(name, fixture as never);
      expect(typeof subject).toBe('string');
      expect(subject.length).toBeGreaterThan(0);
    }
  });

  it('otp subject is a fixed string', () => {
    expect(getSubject('otp', FIXTURES.otp)).toBe('Your sign-in code');
  });

  it('staff-invite subject is a fixed string', () => {
    expect(getSubject('staff-invite', FIXTURES['staff-invite'])).toBe(
      'You have been invited to the admin console',
    );
  });

  it('mfa-reenrol subject is a fixed string', () => {
    expect(getSubject('mfa-reenrol', FIXTURES['mfa-reenrol'])).toBe(
      'Your admin authenticator was reset',
    );
  });

  it('order-confirmation subject contains only orderNumber from data', () => {
    const subject = getSubject('order-confirmation', FIXTURES['order-confirmation']);
    expect(subject).toContain(FIXTURES['order-confirmation'].orderNumber);
    // Verify the subject does not contain other user data (item names, address, etc.)
    expect(subject).not.toContain(FIXTURES['order-confirmation'].items[0]?.name);
    expect(subject).not.toContain(FIXTURES['order-confirmation'].address.city);
  });

  it('order-cancelled subject contains only orderNumber from data', () => {
    const subject = getSubject('order-cancelled', FIXTURES['order-cancelled']);
    expect(subject).toContain(FIXTURES['order-cancelled'].orderNumber);
  });

  it('data-export-ready subject is a fixed string', () => {
    expect(getSubject('data-export-ready', FIXTURES['data-export-ready'])).toBe(
      'Your data export is ready',
    );
  });

  it('account-deleted subject is a fixed string', () => {
    expect(getSubject('account-deleted', FIXTURES['account-deleted'])).toBe(
      'Your account has been deleted',
    );
  });

  it('subjects never contain user-supplied text other than orderNumber', () => {
    const attackName = '<script>alert(1)</script>';

    // order templates — only orderNumber allowed
    const orderSubject = getSubject('order-confirmation', {
      ...FIXTURES['order-confirmation'],
      orderNumber: 'PE-SAFE-001',
      items: [{ name: attackName, quantity: 1, unitPrice: '₹100' }],
    });
    expect(orderSubject).not.toContain(attackName);

    // account-deleted — name must not appear in subject
    const accountSubject = getSubject('account-deleted', { name: attackName });
    expect(accountSubject).not.toContain(attackName);
  });
});
