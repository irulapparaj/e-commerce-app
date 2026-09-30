import { expect, type Page, test } from '@playwright/test';

/**
 * Visual baselines for the shell and the component gallery (P09 §6). Playwright writes the
 * baseline PNGs next to this file on the first run and fails that run; commit them once they are
 * generated on the compose stack, then every later run diffs against them.
 */
const BREAKPOINTS = [375, 768, 1024, 1440] as const;
const THEMES = ['light', 'dark'] as const;
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'gallery', path: '/dev/components' },
] as const;
const VIEWPORT_HEIGHT = 900;
const THEME_COOKIE = 'theme';
const SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  maxDiffPixelRatio: 0.01,
} as const;

/** `toHaveScreenshot` already waits for web fonts; this only settles data requests. */
const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('networkidle');
};

for (const theme of THEMES) {
  for (const width of BREAKPOINTS) {
    for (const { name, path } of PAGES) {
      test(`${name} at ${width}px in ${theme}`, async ({ page, context, baseURL }) => {
        test.skip(baseURL === undefined, 'E2E_BASE_URL is required');
        await context.addCookies([
          { name: THEME_COOKIE, value: theme, url: baseURL ?? 'http://localhost:3000' },
        ]);
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

        const response = await page.goto(path);
        expect(response?.ok()).toBe(true);
        await settle(page);

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page).toHaveScreenshot(`${name}-${width}-${theme}.png`, SCREENSHOT_OPTIONS);
      });
    }
  }
}

test('shell states: open mega menu and mobile drawer', async ({ page, context, baseURL }) => {
  test.skip(baseURL === undefined, 'E2E_BASE_URL is required');
  await context.addCookies([{ name: THEME_COOKIE, value: 'light', url: baseURL ?? '' }]);

  await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
  await page.goto('/');
  await settle(page);
  const trigger = page.getByTestId('mega-menu').getByRole('button').first();
  test.skip(!(await trigger.isVisible()), 'no categories with children seeded');
  await trigger.hover();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveScreenshot('mega-menu-open-1440-light.png', SCREENSHOT_OPTIONS);

  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT });
  await page.getByTestId('mobile-nav-open').click();
  await expect(page.getByTestId('mobile-nav')).toBeVisible();
  await expect(page).toHaveScreenshot('mobile-nav-open-375-light.png', SCREENSHOT_OPTIONS);
});

test('search overlay open state baseline', async ({ page, context, baseURL }) => {
  test.skip(baseURL === undefined, 'E2E_BASE_URL is required');
  await context.addCookies([{ name: THEME_COOKIE, value: 'light', url: baseURL ?? '' }]);
  await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
  await page.goto('/');
  await settle(page);

  await page.getByTestId('search-trigger').click();
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page).toHaveScreenshot('search-overlay-open-1440-light.png', SCREENSHOT_OPTIONS);
});

test('no horizontal scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await settle(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
