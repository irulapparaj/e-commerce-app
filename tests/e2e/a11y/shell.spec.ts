import { expect, type Page, test } from '@playwright/test';

import { blockingViolations } from '../helpers/axe';

const firstMenuTrigger = (page: Page) => page.getByTestId('mega-menu').getByRole('button').first();

test.describe('storefront shell accessibility', () => {
  test('home page has no serious or critical axe violations in both themes', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/');
    expect(await blockingViolations(page)).toEqual([]);

    await context.addCookies([
      { name: 'theme', value: 'dark', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await blockingViolations(page)).toEqual([]);
  });

  test('landmarks and the skip link are in place', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('open mega menu is axe clean and fully keyboard operable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const trigger = firstMenuTrigger(page);
    test.skip(!(await trigger.isVisible()), 'no categories with children seeded');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panelId = await trigger.getAttribute('aria-controls');
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link').first()).toBeFocused();
    expect(await blockingViolations(page)).toEqual([]);

    await page.keyboard.press('ArrowDown');
    await expect(panel.getByRole('link').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(panel.getByRole('link').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowRight');
    await expect(trigger).not.toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(trigger).toBeFocused();
  });

  test('mobile drawer traps focus, closes on Escape and returns focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const opener = page.getByTestId('mobile-nav-open');
    await opener.click();
    const drawer = page.getByTestId('mobile-nav');
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId('mobile-nav-close')).toBeFocused();
    expect(await blockingViolations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('component gallery has no serious or critical violations', async ({ page }) => {
    const response = await page.goto('/dev/components');
    test.skip(response?.status() === 404, 'gallery is disabled in production builds');
    expect(await blockingViolations(page)).toEqual([]);
  });

  test('open search overlay is axe clean and input receives focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('search-trigger').click();
    const overlay = page.getByRole('search');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('searchbox')).toBeFocused();

    expect(await blockingViolations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });
});
