import { expect, type Page, test } from '@playwright/test';

/**
 * Visual baselines for all key pages × themes × breakpoints (P18 §6).
 * First run creates baseline PNGs; commit them after review, then every
 * subsequent run diffs against them with a 1% pixel tolerance.
 */
const BREAKPOINTS = [375, 768, 1440] as const;
const THEMES = ['light', 'dark'] as const;
const VIEWPORT_HEIGHT = 900;
const THEME_COOKIE = 'theme';
const SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  maxDiffPixelRatio: 0.01,
} as const;

const KEY_PAGES = [
  { name: 'home', path: '/' },
  { name: 'collection', path: '/en/collections' },
  { name: 'login', path: '/en/login' },
  { name: 'about', path: '/en/pages/about' },
  { name: 'faq', path: '/en/pages/faq' },
  { name: 'refund-policy', path: '/en/policies/refund' },
  { name: 'admin-login', path: '/admin/login' },
] as const;

const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('networkidle');
};

for (const theme of THEMES) {
  for (const width of BREAKPOINTS) {
    for (const { name, path } of KEY_PAGES) {
      test(`${name} at ${width}px in ${theme}`, async ({ page, context, baseURL }) => {
        test.skip(baseURL === undefined, 'E2E_BASE_URL is required');
        await context.addCookies([
          { name: THEME_COOKIE, value: theme, url: baseURL ?? 'http://localhost:3000' },
        ]);
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

        const response = await page.goto(path);
        test.skip((response?.status() ?? 200) >= 400, `${path} not available`);
        await settle(page);

        await expect(page).toHaveScreenshot(
          `${name}-${width}-${theme}.png`,
          SCREENSHOT_OPTIONS,
        );
      });
    }
  }
}

test('cart page in light at 1440px', async ({ page, context, baseURL }) => {
  test.skip(baseURL === undefined, 'E2E_BASE_URL is required');
  await context.addCookies([
    { name: THEME_COOKIE, value: 'light', url: baseURL ?? 'http://localhost:3000' },
  ]);
  await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
  const response = await page.goto('/en/cart');
  test.skip((response?.status() ?? 200) >= 400, '/en/cart not available');
  await settle(page);
  await expect(page).toHaveScreenshot('cart-1440-light.png', SCREENSHOT_OPTIONS);
});
