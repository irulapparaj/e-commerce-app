import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { authenticator } from 'otplib';

import { deleteAllMessages, readOtp } from './mailpit';

export const ADMIN_EMAIL = 'admin@example.test';

/**
 * Login the seeded admin and complete TOTP.
 * On first call (enrolling) the secret is read from the page and returned.
 * On subsequent calls pass the previously captured `knownSecret`.
 */
export const loginAdmin = async (
  page: Page,
  knownSecret?: string,
): Promise<string> => {
  await deleteAllMessages();
  await page.goto('/admin/login');

  await expect(async () => {
    await page.getByLabel('Email address').fill(ADMIN_EMAIL);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByTestId('otp')).toBeVisible({ timeout: 3_000 });
  }).toPass();

  const otp = await readOtp(ADMIN_EMAIL);
  await page.getByTestId('otp').fill(otp);
  await page.getByRole('button', { name: 'Continue' }).click();

  return completeTotp(page, knownSecret);
};

/** Complete the TOTP step after OTP; returns the TOTP secret (enrolling or known). */
export const completeTotp = async (page: Page, knownSecret?: string): Promise<string> => {
  await page.getByTestId('totp').waitFor();
  const enrolling = await page.getByTestId('totp-secret').isVisible();
  const secret = enrolling
    ? ((await page.getByTestId('totp-secret').textContent())?.trim() ?? '')
    : knownSecret;

  if (!secret) throw new Error('TOTP secret unavailable — set E2E_ADMIN_TOTP_SECRET or reset db');

  await page.getByTestId('totp').fill(authenticator.generate(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return secret;
};

/** Answer a step-up TOTP challenge inside the admin shell. */
export const answerStepUp = async (page: Page, secret: string): Promise<void> => {
  const dialog = page.getByTestId('stepup-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('totp').fill(authenticator.generate(secret));
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).not.toBeVisible();
};

/** Sign out from the admin shell. */
export const signOutAdmin = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('sign-out')).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/admin\/login$/);
};
