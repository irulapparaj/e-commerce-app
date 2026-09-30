import { resolve } from 'node:path';

import { type Browser, expect, type Page, test } from '@playwright/test';

import { answerStepUp, completeTotp, loginAdmin } from '../helpers/admin';
import { deleteAllMessages, readOtp } from '../helpers/mailpit';

const FIXTURE_PNG = resolve(import.meta.dirname, '../../fixtures/media/sample.png');

/** Fill the login form with an arbitrary email and the OTP sent to it. */
const submitEmailAndOtp = async (page: Page, email: string): Promise<void> => {
  // A click before the login form hydrates submits natively; retry until the OTP step renders.
  await expect(async () => {
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByTestId('otp')).toBeVisible({ timeout: 3_000 });
  }).toPass();
  const otp = await readOtp(email);
  await page.getByTestId('otp').fill(otp);
  await page.getByRole('button', { name: 'Continue' }).click();
};

/** Log in as a newly-invited STAFF user (first login = TOTP enrolment) in a fresh browser context. */
const loginStaffInNewContext = async (browser: Browser, email: string): Promise<Page> => {
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await deleteAllMessages();
  await staffPage.goto('/admin/login');
  await submitEmailAndOtp(staffPage, email);
  await completeTotp(staffPage, undefined);
  return staffPage;
};

const csrfToken = async (page: Page): Promise<string> =>
  (await page.context().cookies()).find((cookie) => cookie.name === '__Host-csrf')?.value ?? '';

/** Playwright's request context sends no Origin/Sec-Fetch-Site, which the BFF's CSRF guard requires. */
const baseOrigin = (page: Page): string => new URL(page.url()).origin;

/** The rich-text editor mounts client-side only, so its content element proves the page is hydrated. */
const waitForEditor = async (page: Page): Promise<void> => {
  await page.locator('.admin-editor-content[contenteditable="true"]').waitFor();
};

/** Client-only buttons may be clicked before hydration on a dev server; retry until the dialog opens. */
const openAdjustDialog = async (page: Page, sku: string): Promise<void> => {
  await expect(async () => {
    await page.getByTestId(`adjust-${sku}`).click();
    await expect(page.getByTestId('adjust-dialog')).toBeVisible({ timeout: 1_000 });
  }).toPass();
};

/** Invites a fresh STAFF account through the API (admin session + step-up already active). */
const inviteStaff = async (page: Page, email: string): Promise<void> => {
  const res = await page.request.post('/api/v1/admin/staff', {
    headers: { 'x-csrf-token': await csrfToken(page), origin: baseOrigin(page) },
    data: { email, name: 'E2E Staff', role: 'STAFF' },
  });
  expect(res.status()).toBe(201);
};

const addVariant = async (
  page: Page,
  secret: string | null,
  sku: string,
  label: string,
  price: string,
): Promise<void> => {
  await page.getByTestId('variant-add').click();
  await page.getByTestId('variant-new-sku').fill(sku);
  await page.getByTestId('variant-new-label').fill(label);
  await page.getByTestId('variant-new-weight').fill('60');
  await page.getByTestId('variant-new-price').fill(price);
  await page.getByTestId('variant-new-submit').click();
  if (secret !== null) await answerStepUp(page, secret);
  await expect(page.getByTestId('variant-dialog')).toBeHidden();
  await expect(page.getByLabel(`SKU for ${sku}`)).toBeVisible();
};

test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const productName = `E2E Camphor ${stamp}`;
const productSku = `E2E-${stamp}`;
let productId = '';
let productSlug = '';
let variantId = '';
let adminSecret: string | undefined = process.env.E2E_ADMIN_TOTP_SECRET;

test(
  '@critical admin creates a product with two variants and an image, publishes with step-up, and the public API serves derivatives',
  async ({ page }) => {
    const secret = await loginAdmin(page, adminSecret);
    adminSecret = secret;

    await page.getByTestId('nav-item-products').click();
    await page.getByTestId('product-new').click();
    await waitForEditor(page);
    await page.getByTestId('product-name').fill(productName);
    await page.getByTestId('product-sku').fill(productSku);
    await page.getByTestId('product-category').selectOption({ index: 1 });
    await page.getByTestId('product-save').click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
    productId = page.url().split('/').pop() ?? '';

    await addVariant(page, secret, `${productSku}-50`, '50 g', '80');
    await addVariant(page, null, `${productSku}-100`, '100 g', '150');

    await page.getByTestId('image-input').setInputFiles(FIXTURE_PNG);
    await expect(page.getByTestId('upload-state')).toHaveText('Ready', { timeout: 60_000 });
    await expect(page.getByTestId('image-card')).toHaveCount(1, { timeout: 30_000 });

    await page.getByTestId('publish-toggle').click();
    await expect(page.getByTestId('publish-badge')).toHaveText(/Published/);

    const detail = await page.request.get(`/api/v1/admin/products/${productId}`);
    const product = (await detail.json()) as {
      data: { slug: string; variants: { id: string }[] };
    };
    productSlug = product.data.slug;
    variantId = product.data.variants[0]?.id ?? '';
    const publicDetail = await page.request.get(`/api/v1/products/${productSlug}`);
    expect(publicDetail.status()).toBe(200);
    const body = (await publicDetail.json()) as {
      data: { images: { srcset: { webp: string } }[]; variants: unknown[] };
    };
    expect(body.data.variants).toHaveLength(2);
    expect(body.data.images[0]?.srcset.webp).toContain('-1600.webp');

    await inviteStaff(page, `e2e-staff-${stamp}@example.test`);
  },
);

test(
  'staff edits the description but cannot change prices, then adjusts stock; admin adjusts +150 behind step-up; the ledger shows both',
  async ({ page, browser }) => {
    test.skip(productId === '', 'depends on the product created above');
    const staffEmail = `e2e-staff-${stamp}@example.test`;
    const staffPage = await loginStaffInNewContext(browser, staffEmail);

    await staffPage.goto(`/admin/products/${productId}`);
    await waitForEditor(staffPage);
    await staffPage
      .locator('.admin-editor-content[contenteditable="true"]')
      .fill('Edited by staff');
    await staffPage.getByTestId('product-save').click();
    await expect(staffPage.getByTestId('product-form-status')).toHaveText('Saved');
    await expect(
      staffPage.getByLabel(`Price in rupees for ${productSku}-50`, { exact: true }),
    ).toBeDisabled();
    const forbidden = await staffPage.request.patch(
      `/api/v1/admin/products/${productId}/variants/${variantId}/price`,
      {
        headers: { 'x-csrf-token': await csrfToken(staffPage), origin: baseOrigin(staffPage) },
        data: { price: 1, compareAtPrice: null },
      },
    );
    expect(forbidden.status()).toBe(403);

    await staffPage.goto(`/admin/inventory?q=${encodeURIComponent(productSku)}`);
    await openAdjustDialog(staffPage, `${productSku}-50`);
    await staffPage.getByTestId('adjust-delta').fill('5');
    await staffPage.getByTestId('adjust-note').fill('Initial count by staff');
    await staffPage.getByTestId('adjust-submit').click();
    await expect(
      staffPage.getByTestId('toast').filter({ hasText: 'stock is now 5' }),
    ).toBeVisible();
    await openAdjustDialog(staffPage, `${productSku}-50`);
    await staffPage.getByTestId('adjust-delta').fill('-5');
    await staffPage.getByTestId('adjust-note').fill('Damaged in storage');
    await staffPage.getByTestId('adjust-submit').click();
    await expect(
      staffPage.getByTestId('toast').filter({ hasText: 'stock is now 0' }),
    ).toBeVisible();
    await staffPage.context().close();

    const secret = await loginAdmin(page, adminSecret);
    adminSecret = secret;
    await page.goto(`/admin/inventory?q=${encodeURIComponent(productSku)}`);
    await openAdjustDialog(page, `${productSku}-50`);
    await page.getByTestId('adjust-delta').fill('150');
    await expect(page.getByTestId('adjust-stepup-hint')).toBeVisible();
    await page.getByTestId('adjust-note').fill('Bulk restock from supplier');
    await page.getByTestId('adjust-submit').click();
    await answerStepUp(page, secret);
    await expect(page.getByTestId('toast').filter({ hasText: 'stock is now 150' })).toBeVisible();

    await page.goto(`/admin/inventory/movements?variantId=${variantId}`);
    const deltas = page.getByTestId('ledger-delta');
    await expect(deltas).toHaveCount(3);
    await expect(deltas.nth(0)).toHaveText('+150');
    await expect(deltas.nth(1)).toHaveText('−5');
    await expect(deltas.nth(2)).toHaveText('+5');
  },
);
