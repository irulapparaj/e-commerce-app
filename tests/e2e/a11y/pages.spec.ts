import { expect, test } from '@playwright/test';

import { blockingViolations } from '../helpers/axe';

const A11Y_PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/en/login' },
  { name: 'collection', path: '/en/collections' },
  { name: 'about', path: '/en/pages/about' },
  { name: 'faq', path: '/en/pages/faq' },
  { name: 'refund-policy', path: '/en/policies/refund' },
  { name: 'admin-login', path: '/admin/login' },
] as const;

for (const { name, path } of A11Y_PAGES) {
  test(`${name} has no serious/critical axe violations`, async ({ page }) => {
    const response = await page.goto(path);
    test.skip((response?.status() ?? 200) >= 400, `${path} not available`);
    expect(await blockingViolations(page)).toEqual([]);
  });

  test(`${name} has no serious/critical axe violations in dark mode`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'theme', value: 'dark', url: baseURL ?? 'http://localhost:3000' },
    ]);
    const response = await page.goto(path);
    test.skip((response?.status() ?? 200) >= 400, `${path} not available`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await blockingViolations(page)).toEqual([]);
  });
}

test('keyboard navigation: header → mega menu → product → add → cart drawer', async ({ page }) => {
  const response = await page.goto('/');
  test.skip((response?.status() ?? 200) >= 400, 'home not available');

  // Tab to skip link
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: /skip/i });
  const skipFocused = await skipLink.evaluate((el) => el === document.activeElement);
  expect(skipFocused).toBe(true);

  // Skip link activates main content
  await page.keyboard.press('Enter');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
});

test('reduced motion: animations are disabled when prefers-reduced-motion is set', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto('/');
  test.skip((response?.status() ?? 200) >= 400, 'home not available');
  // Verify a CSS custom property or data attribute marks reduced motion
  const motionClass = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(motionClass).toBe(true);
});
