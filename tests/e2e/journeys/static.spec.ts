import { type Page, expect, test } from '@playwright/test';

/**
 * Static page smoke tests — quick links and policy links from the footer.
 *
 * Strategy: navigate to each URL, assert the response is 2xx, and verify
 * there is a visible <h1> on the page.  Every link that appears in the footer
 * is exercised so a broken URL is caught before it ships.
 */

const LOCALE = 'en';

const assertPageLoads = async (page: Page, path: string): Promise<void> => {
  const response = await page.goto(path);
  expect(response, `No response for ${path}`).not.toBeNull();
  expect(response!.status(), `${path} returned non-2xx`).toBeLessThan(400);
  await expect(page.locator('h1'), `h1 missing on ${path}`).toBeVisible();
};

// ── Quick links ──────────────────────────────────────────────────────────────

test('@critical home page loads with brand title and h1', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Puja Essentials/);
  await expect(page.locator('h1')).toBeVisible();
});

test('about us page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/about-us`);
  await expect(page.locator('h1')).toContainText(/about/i);
});

test('contact page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/contact`);
  await expect(page.locator('h1')).toContainText(/contact/i);
});

test('FAQ page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/faq`);
  await expect(page.locator('h1')).toContainText(/faq/i);
});

test('knowledge hub page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/knowledge-hub`);
  await expect(page.locator('h1')).toContainText(/knowledge/i);
});

test('become a seller page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/become-a-seller`);
  await expect(page.locator('h1')).toBeVisible();
});

test('grievance officer page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/pages/grievance-redressal`);
  await expect(page.locator('h1')).toBeVisible();
});

// ── Policy links ─────────────────────────────────────────────────────────────

test('shipping policy page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/policies/shipping`);
  await expect(page.locator('h1')).toContainText(/shipping/i);
});

test('refund & return policy page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/policies/refund`);
  await expect(page.locator('h1')).toContainText(/refund/i);
});

test('privacy policy page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/policies/privacy`);
  await expect(page.locator('h1')).toContainText(/privacy/i);
});

test('terms of service page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/policies/terms`);
  await expect(page.locator('h1')).toBeVisible();
});

test('pricing policy page loads', async ({ page }) => {
  await assertPageLoads(page, `/${LOCALE}/policies/pricing`);
  await expect(page.locator('h1')).toContainText(/pricing/i);
});

// ── Footer link navigation ────────────────────────────────────────────────────

test('footer quick links all resolve from home page', async ({ page }) => {
  await page.goto(`/${LOCALE}`);

  const footer = page.locator('[data-testid="site-footer"]');

  const quickLinks = [
    { text: 'About us', url: '/pages/about-us' },
    { text: 'Contact', url: '/pages/contact' },
    { text: 'FAQ', url: '/pages/faq' },
    { text: 'Knowledge hub', url: '/pages/knowledge-hub' },
    { text: 'Become a seller', url: '/pages/become-a-seller' },
    { text: 'Grievance officer', url: '/pages/grievance-redressal' },
  ];

  for (const { text, url } of quickLinks) {
    const href = await footer.getByRole('link', { name: text }).getAttribute('href');
    expect(href, `Footer link "${text}" has wrong href`).toContain(url);
  }
});

test('footer policy links all resolve from home page', async ({ page }) => {
  await page.goto(`/${LOCALE}`);

  const footer = page.locator('[data-testid="site-footer"]');

  const policyLinks = [
    { text: 'Shipping policy', url: '/policies/shipping' },
    { text: 'Refund & return policy', url: '/policies/refund' },
    { text: 'Privacy policy', url: '/policies/privacy' },
    { text: 'Terms of service', url: '/policies/terms' },
    { text: 'Pricing policy', url: '/policies/pricing' },
  ];

  for (const { text, url } of policyLinks) {
    const href = await footer.getByRole('link', { name: text }).getAttribute('href');
    expect(href, `Footer link "${text}" has wrong href`).toContain(url);
  }
});
