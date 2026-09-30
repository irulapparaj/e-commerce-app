import { type Browser, expect, type Page, test } from '@playwright/test';

import { ADMIN_EMAIL, answerStepUp, loginAdmin } from '../helpers/admin';
import { deleteAllMessages, readOtp } from '../helpers/mailpit';

/** The E2E stack sets PII_REVEAL_TTL_SECONDS to a few seconds so the re-mask can be watched. */
const REVEAL_EXPIRY_TIMEOUT_MS = 20_000;
const GENERIC_LOGIN_ERROR = 'That did not work. Check the details and try again.';
const REVEAL_REASON = 'Support ticket 1234: verify contact details';
const DISABLE_REASON = 'Abusive behaviour reported in ticket 1234';
const ERASE_REASON = 'DPDP erasure request ref 9876';

/** Client-only buttons may be clicked before hydration on a dev server; retry until the dialog opens. */
const openDialog = async (page: Page, button: string, dialog: string): Promise<void> => {
  await expect(async () => {
    await page.getByTestId(button).click();
    await expect(page.getByTestId(dialog)).toBeVisible({ timeout: 1_000 });
  }).toPass();
};

/** Answer a step-up challenge only when the dialog is actually visible (grace window active). */
const answerStepUpIfShown = async (page: Page, secret: string): Promise<void> => {
  const dialog = page.getByTestId('stepup-dialog');
  const shown = await dialog.isVisible({ timeout: 2_000 }).catch(() => false);
  if (shown) await answerStepUp(page, secret);
};

/** Fill the storefront OTP login form for a given email. */
const requestOtp = async (page: Page, email: string): Promise<void> => {
  // A click before the login form hydrates submits natively; retry until the OTP step renders.
  await expect(async () => {
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByTestId('otp')).toBeVisible({ timeout: 3_000 });
  }).toPass();
};

/** Signs a brand-new customer up on the storefront in its own context, then closes it. */
const createCustomer = async (browser: Browser, email: string): Promise<void> => {
  const context = await browser.newContext();
  const customerPage = await context.newPage();
  await deleteAllMessages();
  await customerPage.goto('/login');
  await requestOtp(customerPage, email);
  const otp = await readOtp(email);
  await customerPage.getByTestId('otp').fill(otp);
  await customerPage.getByRole('button', { name: 'Continue' }).click();
  await expect(customerPage).toHaveURL(/\/account$/);
  await context.close();
};

test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const customerLocalPart = `e2e-cust-${stamp}`;
const customerEmail = `${customerLocalPart}@example.test`;
const maskedEmail = 'e•••@example.test';
/** Each test gets a new browser context; the TOTP secret enrolled by the first test carries over. */
let adminSecret: string | undefined = process.env.E2E_ADMIN_TOTP_SECRET;
let customerId = '';

test('admin finds a new customer masked, reveals the email with a reason behind step-up, and it re-masks when the window closes', async ({
  page,
  browser,
}) => {
  await createCustomer(browser, customerEmail);
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  await page.getByTestId('nav-item-customers').click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
  await expect(async () => {
    await page.getByTestId('customer-search').fill(customerLocalPart);
    await page.getByTestId('customer-search-submit').click();
    await expect(page).toHaveURL(/q=e2e-cust/, { timeout: 3_000 });
  }).toPass();
  const row = page.getByTestId('customer-row').first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('customer-masked-email')).toHaveText(maskedEmail);
  await expect(row).not.toContainText(customerLocalPart);
  await expect(row.getByTestId('customer-status')).toHaveText('Active');

  await row.click();
  await expect(page).toHaveURL(/\/admin\/customers\/[0-9a-f-]{36}$/);
  customerId = page.url().split('/').pop() ?? '';
  await expect(page.getByTestId('customer-masked-email')).toHaveText(maskedEmail);

  await openDialog(page, 'customer-reveal-open', 'reveal-dialog');
  await expect(page.getByTestId('reveal-submit')).toBeDisabled();
  await page.getByTestId('reveal-reason').fill(REVEAL_REASON);
  await page.getByTestId('reveal-submit').click();
  await answerStepUp(page, secret);
  await expect(page.getByTestId('customer-pii-email')).toHaveText(customerEmail);
  await expect(page.getByTestId('reveal-countdown')).toHaveText(/^\d{2}:\d{2}$/);

  // The token expires server-side; the dialog drops the values and asks for a new reason.
  await expect(page.getByTestId('customer-pii-email')).toHaveCount(0, {
    timeout: REVEAL_EXPIRY_TIMEOUT_MS,
  });
  await expect(page.getByTestId('reveal-notice')).toBeVisible();
  await expect(page.getByTestId('reveal-reason')).toHaveValue('');
  await expect(page.getByTestId('reveal-submit')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reveal-dialog')).toBeHidden();
  await expect(page.getByTestId('customer-masked-email')).toHaveText(maskedEmail);

  await page.goto('/admin/audit?action=customer.pii.reveal');
  await expect(page.getByTestId('audit-row').first()).toContainText('customer.pii.reveal');
});

test('admin disables the customer (OTP login then fails generically), enables them, and erases them with an audited reason', async ({
  page,
  browser,
}) => {
  test.skip(customerId === '', 'depends on the customer found above');
  const secret = await loginAdmin(page, adminSecret);

  await page.goto(`/admin/customers/${customerId}`);
  await openDialog(page, 'customer-disable-open', 'disable-dialog');
  await page.getByTestId('disable-reason').fill(DISABLE_REASON);
  await page.getByTestId('disable-submit').click();
  await answerStepUp(page, secret);
  await expect(page.getByTestId('customer-status')).toHaveText('Disabled');
  await expect(page.getByTestId('customer-enable')).toBeVisible();

  // The disabled customer gets no way in: the code step fails with the generic message.
  const context = await browser.newContext();
  const customerPage = await context.newPage();
  await deleteAllMessages();
  await customerPage.goto('/login');
  await requestOtp(customerPage, customerEmail);
  let otp = '000000';
  try {
    otp = await readOtp(customerEmail);
  } catch {
    // Server may or may not send an OTP to a disabled account; fall back to a dummy code.
  }
  await customerPage.getByTestId('otp').fill(otp);
  await customerPage.getByRole('button', { name: 'Continue' }).click();
  await expect(customerPage.locator('p.critical[role="alert"]')).toHaveText(GENERIC_LOGIN_ERROR);
  await expect(customerPage).toHaveURL(/\/login/);
  await context.close();

  await page.getByTestId('customer-enable').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Account enabled' })).toBeVisible();
  await expect(page.getByTestId('customer-status')).toHaveText('Active');

  await openDialog(page, 'customer-erase-open', 'erase-dialog');
  await page.getByTestId('erase-reason').fill(ERASE_REASON);
  await page.getByTestId('erase-submit').click();
  await answerStepUpIfShown(page, secret);
  await expect(page.getByTestId('customer-name')).toHaveText('Deleted user');
  await expect(page.getByTestId('customer-status')).toHaveText('Deleted');
  await expect(page.getByTestId('customer-erase-open')).toBeDisabled();

  await page.reload();
  await expect(page.getByTestId('customer-name')).toHaveText('Deleted user');
  await expect(page.getByTestId('customer-masked-email')).not.toHaveText(maskedEmail);

  await page.goto('/admin/audit?action=customer.erased');
  const auditRow = page.getByTestId('audit-row').first();
  await expect(auditRow).toContainText('customer.erased');
  await expect(auditRow).toContainText(ADMIN_EMAIL);
  await auditRow.click();
  const detail = page.getByTestId('audit-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(ERASE_REASON);
});
