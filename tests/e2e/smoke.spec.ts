import { expect, test } from '@playwright/test';

test('storefront home loads with the brand title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Puja Essentials/);
  await expect(page.locator('h1')).toBeVisible();
});
