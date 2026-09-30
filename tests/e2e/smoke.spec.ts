import { expect, test } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** The home <title> is `${brand.name} · ${brand.tagline}`, so assert against the live settings
 *  rather than the seed default — admin-customised environments must not fail the smoke test. */
test('storefront home loads with the brand title', async ({ page, request }) => {
  const response = await request.get(`${API_URL}/api/v1/settings/public`);
  expect(response.ok(), 'public settings endpoint must answer — is the API running?').toBe(true);
  const body = (await response.json()) as { data: { brand: { name: string } } };
  const brandName = body.data.brand.name;
  expect(brandName.length).toBeGreaterThan(0);

  await page.goto('/');
  await expect(page).toHaveTitle(new RegExp(brandName));
  await expect(page.locator('h1')).toBeVisible();
});
