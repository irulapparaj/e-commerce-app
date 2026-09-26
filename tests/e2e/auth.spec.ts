import { expect, type Page, test } from '@playwright/test';
import { authenticator } from 'otplib';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_EMAIL = 'admin@example.test';

interface MailpitMessage {
  readonly ID: string;
  readonly Created: string;
}

const readOtpFromMailpit = async (email: string): Promise<string> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await list.json()) as { messages: MailpitMessage[] };
    const newest = [...messages].sort((a, b) => b.Created.localeCompare(a.Created))[0];
    if (newest !== undefined) {
      const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
      const { Text } = (await detail.json()) as { Text: string };
      const match = /\b(\d{6})\b/.exec(Text);
      if (match?.[1] !== undefined) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no OTP email for ${email}`);
};

const deleteMailpitMessages = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
};

const submitEmailAndOtp = async (page: Page, email: string): Promise<void> => {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  const otp = await readOtpFromMailpit(email);
  await page.getByTestId('otp').fill(otp);
  await page.getByRole('button', { name: 'Continue' }).click();
};

test.beforeEach(async () => {
  await deleteMailpitMessages();
});

test('customer logs in with an emailed OTP and lands on /account', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;

  await page.goto('/login');
  await submitEmailAndOtp(page, email);

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('session-user')).toContainText('CUSTOMER');
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

test('visiting /checkout unauthenticated redirects to /login with a validated redirect', async ({
  page,
}) => {
  await page.goto('/checkout');

  await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/);
});

test('an unsafe redirect parameter is ignored after login', async ({ page }) => {
  const email = `e2e-redirect-${Date.now()}@example.test`;

  await page.goto('/login?redirect=//evil.com');
  await submitEmailAndOtp(page, email);

  await expect(page).toHaveURL(/\/account$/);
});

test('admin first login enrols TOTP and the second login requires it', async ({ page }) => {
  await page.goto('/admin/login');
  await submitEmailAndOtp(page, ADMIN_EMAIL);

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

  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await deleteMailpitMessages();
  await submitEmailAndOtp(page, ADMIN_EMAIL);
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
