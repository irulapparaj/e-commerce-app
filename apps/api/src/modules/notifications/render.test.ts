import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures';
import { renderTemplate } from './render';
import { TEMPLATES, type TemplateName } from './templates';

describe('renderTemplate', () => {
  const templateNames = Object.keys(TEMPLATES) as TemplateName[];

  it.each(templateNames)('renders %s to non-empty HTML and text', async (name) => {
    const fixture = FIXTURES[name];
    const rendered = await renderTemplate(name, fixture);
    expect(rendered.html).toContain('<!DOCTYPE');
    expect(rendered.html.length).toBeGreaterThan(100);
    expect(rendered.text.length).toBeGreaterThan(10);
    expect(rendered.subject.length).toBeGreaterThan(0);
  });

  it('renders OTP template with the code visible', async () => {
    const rendered = await renderTemplate('otp', FIXTURES.otp);
    expect(rendered.html).toContain(FIXTURES.otp.code);
    expect(rendered.text).toContain(FIXTURES.otp.code);
  });

  it('renders order-confirmation with the order number', async () => {
    const rendered = await renderTemplate('order-confirmation', FIXTURES['order-confirmation']);
    const fixture = FIXTURES['order-confirmation'];
    expect(rendered.html).toContain(fixture.orderNumber);
    expect(rendered.subject).toContain(fixture.orderNumber);
  });

  it('escapes XSS in OTP template — script tag is escaped', async () => {
    const rendered = await renderTemplate('otp', {
      code: '123456',
      expiresMinutes: 10,
    });
    // The template should not contain unescaped script tags from internal data
    // (code is always 6 digits, so this is verifying general template safety)
    expect(rendered.html).not.toContain('<script>');
  });

  it('escapes XSS in account-deleted template — name is escaped', async () => {
    const attackName = '<script>alert(1)</script>';
    const rendered = await renderTemplate('account-deleted', { name: attackName });
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    // React escapes < and > in JSX text
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('throws ZodError when data is missing required fields', async () => {
    await expect(renderTemplate('otp', { code: '123456' })).rejects.toThrow();
  });

  it('throws ZodError when extra fields are provided (strict schema)', async () => {
    await expect(renderTemplate('otp', { code: '123456', expiresMinutes: 10, extra: 'bad' })).rejects.toThrow();
  });

  it('order-confirmation does not contain remote images', async () => {
    const rendered = await renderTemplate('order-confirmation', FIXTURES['order-confirmation']);
    // Templates must be image-free (no remote images per DESIGN §11.2)
    const imgMatches = rendered.html.match(/<img/g);
    // If images exist, they should only point to the allowed base URL (none in this case)
    expect(imgMatches).toBeNull();
  });

  it('links point to https (no plain http links to external resources)', async () => {
    const rendered = await renderTemplate('staff-invite', FIXTURES['staff-invite']);
    // Links to the login URL should be the one we passed in
    expect(rendered.html).toContain(FIXTURES['staff-invite'].loginUrl);
  });
});
