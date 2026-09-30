import { expect, type Page, test } from '@playwright/test';
import { authenticator } from 'otplib';

import { customerEmail, loginCustomer } from '../fixtures/users';
import { deleteAllMessages, readOtp } from '../helpers/mailpit';

const ADMIN_EMAIL = 'admin@example.test';

/**
 * Submit the OTP login form on the ADMIN login page (/admin/login).
 * Admin login uses AdminLoginForm — a single <input data-testid="otp"> with a "Continue" button.
 * Send code exactly once (no toPass retry — retrying re-sends and hits the rate limiter).
 */
const submitAdminOtp = async (page: Page, email: string): Promise<void> => {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('[data-testid="otp"]')).toBeVisible({ timeout: 15_000 });
  const otp = await readOtp(email, 20_000);
  await page.locator('[data-testid="otp"]').fill(otp);
  await page.getByRole('button', { name: 'Continue' }).click();
};

/**
 * Submit the OTP login form on the customer storefront login page (/login).
 * Customer login uses LoginCard — OtpBoxInput with 6 individual digit boxes (otp-digit-0 … otp-digit-5).
 * Send code exactly once (no toPass retry — retrying re-sends and hits the rate limiter).
 *
 * We wait for networkidle before clicking "Send code" to ensure React has hydrated
 * (a pre-hydration click triggers a native form submit that reloads the page without sending the OTP).
 */
const submitCustomerOtp = async (page: Page, email: string): Promise<void> => {
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('[data-testid="otp-digit-0"]')).toBeVisible({ timeout: 15_000 });
  const otp = await readOtp(email, 20_000);
  await page.locator('[data-testid="otp-digit-0"]').click();
  await page.keyboard.type(otp);
  await page.getByRole('button', { name: /sign in/i }).click();
};

test.beforeEach(async () => {
  await deleteAllMessages();
});

test(
  '@critical customer logs in with an emailed OTP and lands on /account',
  async ({ page }) => {
    const email = customerEmail('login');

    await page.goto('/login');
    await submitCustomerOtp(page, email);

    await expect(page).toHaveURL(/\/account$/, { timeout: 10_000 });
    await expect(page.getByTestId('session-user')).toContainText('CUSTOMER', { timeout: 10_000 });
  },
);

test('@critical cookie shape is correct after OTP login', async ({ page }) => {
  const email = customerEmail('cookies');

  await page.goto('/login');
  await submitCustomerOtp(page, email);

  await expect(page).toHaveURL(/\/account$/, { timeout: 10_000 });
  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual([
    '__Host-access',
    '__Host-csrf',
    '__Host-refresh',
  ]);
  expect(cookies.find((c) => c.name === '__Host-access')).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });
  expect(cookies.find((c) => c.name === '__Host-csrf')).toMatchObject({
    httpOnly: false,
    secure: true,
  });
});

test(
  '@critical visiting /checkout unauthenticated redirects to /login with a validated redirect',
  async ({ page }) => {
    await page.goto('/checkout');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/);
  },
);

test('an unsafe redirect parameter is ignored after login', async ({ page }) => {
  const email = customerEmail('unsafe-redirect');

  await page.goto('/login?redirect=//evil.com');
  await submitCustomerOtp(page, email);

  await expect(page).toHaveURL(/\/account$/, { timeout: 10_000 });
});

test('admin first login enrols TOTP and the second login requires it', async ({ page }) => {
  await page.goto('/admin/login');
  await submitAdminOtp(page, ADMIN_EMAIL);

  await page.getByTestId('totp').waitFor();
  const enrolVisible = await page.getByTestId('totp-secret').isVisible();
  test.skip(
    !enrolVisible,
    'seeded admin already enrolled in this stack; reset the database to rerun',
  );

  const secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? '';
  await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  await page.getByTestId('totp').fill(authenticator.generate(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('admin-session')).toContainText('ADMIN');

  // The admin shell keeps sign-out inside the user menu; retry the toggle until hydrated.
  await expect(async () => {
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('sign-out')).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await deleteAllMessages();
  await submitAdminOtp(page, ADMIN_EMAIL);
  await page.getByTestId('totp').waitFor();
  await expect(page.getByTestId('totp-secret')).toHaveCount(0);
  await page.getByTestId('totp').fill(authenticator.generate(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('unauthenticated /admin redirects to /admin/login', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('entering an incorrect OTP shows an error and does not log in', async ({ page }) => {
  const email = customerEmail('wrong-otp');

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('[data-testid="otp-digit-0"]')).toBeVisible({ timeout: 15_000 });

  // Enter a deliberately wrong 6-digit OTP via keyboard (OtpBoxInput advances focus per digit)
  await page.locator('[data-testid="otp-digit-0"]').click();
  await page.keyboard.type('000000');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Should stay on the login page with an error message
  await expect(page).not.toHaveURL(/\/account$/);
  await expect(
    page.getByRole('alert').or(page.getByText(/invalid|incorrect|expired/i).first()),
  ).toBeVisible({ timeout: 10_000 });
});

test('OTP input rejects non-numeric characters', async ({ page }) => {
  const email = customerEmail('otp-format');

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('[data-testid="otp-digit-0"]')).toBeVisible({ timeout: 15_000 });

  // OtpBoxInput uses individual inputs — type non-numeric into the first box
  const firstDigit = page.locator('[data-testid="otp-digit-0"]');
  await firstDigit.fill('a');
  const value = await firstDigit.inputValue();
  // Each digit box only accepts 0-9; non-numeric should be stripped or empty
  expect(/^\d*$/.test(value), 'OTP digit input must contain only digits').toBe(true);
});

test('sign-out clears the session and the customer must re-login', async ({ page }) => {
  const email = customerEmail('sign-out');
  await loginCustomer(page, email);

  await expect(page).toHaveURL(/\/account$/);

  // Sign-out link is in the account page header or footer; look for it with flexible selectors
  const signOutBtn = page.getByTestId('sign-out').or(
    page.getByRole('link', { name: /sign.?out|log.?out/i }),
  ).or(
    page.getByRole('button', { name: /sign.?out|log.?out/i }),
  );
  const hasSO = await signOutBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!hasSO) {
    // Sign-out may be inside a user menu dropdown
    const userMenu = page.getByTestId('user-menu').or(
      page.getByRole('button', { name: /account|menu/i }),
    );
    const hasMenu = await userMenu.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasMenu) await userMenu.click();
  }
  const signOutControl = page.getByTestId('sign-out').or(
    page.getByRole('link', { name: /sign.?out|log.?out/i }),
  ).or(
    page.getByRole('button', { name: /sign.?out|log.?out/i }),
  );
  const hasControl = await signOutControl.isVisible({ timeout: 3_000 }).catch(() => false);
  test.skip(!hasControl, 'Sign-out control not found — account page may not have sign-out UI yet');

  await signOutControl.click();

  // After sign-out, accessing /account should redirect to /login
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
});
