import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { deleteAllMessages, readOtp } from '../helpers/mailpit';

/** Generate a unique e2e customer email using a test-name slug.
 *  Uses a random UUID fragment to avoid per-email OTP rate-limit collisions across rapid re-runs. */
export const customerEmail = (slug: string): string => {
  const rand = Math.random().toString(36).slice(2, 10);
  return `e2e-${slug}-${rand}@example.test`;
};

/**
 * Submit the OTP login form and land on /account.
 * Creates the customer if they do not exist (OTP signup flow).
 *
 * The storefront login uses OtpBoxInput (6 individual digit boxes).
 * We click the first box then keyboard-type the full code so the focus-advance
 * logic in OtpBoxInput can propagate naturally.
 *
 * NOTE: "Send code" is clicked exactly once. Do NOT wrap in toPass() — that
 * would re-send the code on retry and trigger the rate-limiter.
 */
export const loginCustomer = async (page: Page, email: string): Promise<void> => {
  await page.goto('/login');
  // Wait for React hydration — a pre-hydration click triggers native form submit (page reload).
  // LoginCard sets data-hydrated="true" on the form via useEffect (which runs after hydration).
  // This is more reliable than waitForLoadState('networkidle') which stalls on persistent
  // WebSocket/SSE connections opened by the Next.js dev tools.
  await page.waitForSelector('form[data-hydrated="true"]', { timeout: 30_000 });
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();

  // Wait for the OTP digit boxes to appear (15 s to accommodate Mailpit latency)
  await expect(page.locator('[data-testid="otp-digit-0"]')).toBeVisible({ timeout: 15_000 });

  const otp = await readOtp(email, 20_000);

  // Click the first digit box then type — OtpBoxInput auto-advances focus per digit
  await page.locator('[data-testid="otp-digit-0"]').click();
  await page.keyboard.type(otp);

  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 10_000 });
};

/** Clear all mailpit messages before creating a user to avoid OTP collision. */
export const createCustomer = async (page: Page, slug: string): Promise<{ email: string }> => {
  await deleteAllMessages();
  const email = customerEmail(slug);
  await loginCustomer(page, email);
  return { email };
};
