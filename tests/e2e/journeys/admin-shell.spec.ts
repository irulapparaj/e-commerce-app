import { type Browser, expect, type Page, test } from '@playwright/test';

import { ADMIN_EMAIL, answerStepUp, completeTotp, loginAdmin } from '../helpers/admin';
import { deleteAllMessages, readOtp, searchMessages } from '../helpers/mailpit';

const ADMIN_ONLY_NAV = ['settings', 'staff', 'audit', 'security'] as const;

/** Wait until a message whose Subject matches a regex arrives for the given address. */
const waitForMailpitSubject = async (email: string, subject: RegExp): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const messages = await searchMessages(email);
    if (messages.some((message) => subject.test(message.Subject))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no email matching ${subject} for ${email}`);
};

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

test.describe.configure({ mode: 'serial' });

/** Each test gets a new browser context; the TOTP secret enrolled by the first test carries over. */
let adminSecret: string | undefined = process.env.E2E_ADMIN_TOTP_SECRET;

test('admin changes the free-shipping threshold behind step-up and sees the audit row', async ({
  page,
}) => {
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;
  await expect(page.getByTestId('admin-session')).toContainText('ADMIN');
  const shell = await page.request.get('/admin');
  expect(shell.headers()['content-security-policy']).not.toContain('razorpay');
  expect(shell.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  await page.getByTestId('nav-item-settings').click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  const threshold = page.getByLabel('Threshold (paise)');
  // Dev-mode hydration can lag the first paint; retry until the tab's form is actually mounted.
  await expect(async () => {
    await page.getByTestId('settings-tab-free_shipping_threshold').click();
    await expect(threshold).toBeVisible({ timeout: 1_000 });
  }).toPass();
  const current = Number.parseInt((await threshold.inputValue()) || '0', 10);
  const next = current === 59900 ? 69900 : 59900;
  await threshold.fill(String(next));
  await page.getByTestId('settings-save').click();

  await answerStepUp(page, secret);
  await expect(page.getByTestId('toast')).toContainText('Saved');
  await page.getByTestId('user-menu').click();
  await expect(page.getByTestId('stepup-countdown')).toHaveText(/\d{2}:\d{2} left/);
  await page.keyboard.press('Escape');

  await page.getByTestId('nav-item-audit').click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await page.getByLabel('Action', { exact: true }).fill('settings.updated');
  await page.getByTestId('audit-apply').click();
  const row = page.getByTestId('audit-row').first();
  await expect(row).toContainText('settings.updated');
  await expect(row).toContainText(ADMIN_EMAIL);
  await row.click();
  const detail = page.getByTestId('audit-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(String(next));
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toBeHidden();
});

test('a STAFF member invited from the UI sees no admin-only navigation and is refused directly', async ({
  page,
  browser,
}) => {
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;
  const staffEmail = `e2e-staff-${Date.now()}@example.test`;

  await page.getByTestId('nav-item-staff').click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  // Dev-mode hydration can lag; retry the click until the dialog mounts.
  await expect(async () => {
    await page.getByTestId('invite-open').click();
    await expect(page.getByTestId('invite-email')).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByTestId('invite-email').fill(staffEmail);
  await page.getByTestId('invite-name').fill('E2E Staff');
  await page.getByTestId('invite-role').selectOption('STAFF');
  await page.getByTestId('invite-submit').click();
  await answerStepUp(page, secret);
  await expect(page.getByTestId('toast')).toContainText(`Invite sent to ${staffEmail}`);
  await waitForMailpitSubject(staffEmail, /invited/i);
  await expect(page.getByTestId('staff-row').filter({ hasText: staffEmail })).toBeVisible();

  const staffPage = await loginStaffInNewContext(browser, staffEmail);
  await expect(staffPage.getByTestId('admin-session')).toContainText('STAFF');
  const nav = staffPage.getByTestId('admin-nav');
  await expect(nav.getByTestId('nav-item-dashboard')).toBeVisible();
  await expect(nav.getByTestId('nav-item-products')).toBeVisible();
  for (const key of ADMIN_ONLY_NAV) await expect(nav.getByTestId(`nav-item-${key}`)).toHaveCount(0);

  await staffPage.goto('/admin/settings');
  await expect(staffPage.getByTestId('not-permitted')).toContainText(/not permitted/i);

  // UI hiding is not the control: the API refuses the STAFF token even with a valid CSRF pair.
  const direct = await staffPage.request.put('/api/v1/admin/settings/free_shipping_threshold', {
    headers: {
      origin: new URL(staffPage.url()).origin,
      'x-csrf-token': await csrfToken(staffPage),
      'content-type': 'application/json',
    },
    data: { value: 1 },
  });
  expect(direct.status()).toBe(403);
  expect(((await direct.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  await staffPage.context().close();
});
