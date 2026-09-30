import { expect, type Page, test } from '@playwright/test';

/**
 * Visual baselines for the skins (the classic design is covered by shell.spec.ts). As there,
 * Playwright writes the PNGs next to this file on the first run and fails that run; commit them
 * once generated on the compose stack, then every later run diffs against them.
 */
const SKINS = ['mandir-gold', 'pushpa-purity', 'utsav-rang', 'sandhya-aarti'] as const;
const THEMES = ['light', 'dark'] as const;
const BREAKPOINTS = [375, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const DEFAULT_ORIGIN = 'http://localhost:3000';
const SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  maxDiffPixelRatio: 0.01,
} as const;

/** `toHaveScreenshot` already waits for web fonts; this only settles data requests. */
const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('networkidle');
};

for (const skin of SKINS) {
  for (const theme of THEMES) {
    for (const width of BREAKPOINTS) {
      test(`home in ${skin} at ${width}px in ${theme}`, async ({ page, context, baseURL }) => {
        const url = baseURL ?? DEFAULT_ORIGIN;
        await context.addCookies([
          { name: 'skin', value: skin, url },
          { name: 'theme', value: theme, url },
        ]);
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

        const response = await page.goto('/');
        expect(response?.ok()).toBe(true);
        await settle(page);

        await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page).toHaveScreenshot(
          `home-${skin}-${width}-${theme}.png`,
          SCREENSHOT_OPTIONS,
        );
      });
    }
  }
}

test('look-and-feel menu open state baseline', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'theme', value: 'light', url: baseURL ?? DEFAULT_ORIGIN }]);
  await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
  await page.goto('/');
  await settle(page);

  await page.getByRole('button', { name: 'Change look and feel' }).click();
  await expect(page.getByRole('dialog', { name: 'Look & feel' })).toBeVisible();
  await expect(page).toHaveScreenshot('look-and-feel-open-1440-light.png', SCREENSHOT_OPTIONS);
});
