import { expect, test } from '@playwright/test';

/**
 * Home persuasion sections (design plan P1.3, P1.4, P3.2): the reassurance band,
 * customer testimonials and the five-question FAQ ahead of the footer.
 * No authentication required.
 */

test('@critical home shows the reassurance band, testimonials and FAQ', async ({ page }) => {
  const response = await page.goto('/');
  expect(
    response?.status(),
    'Expected home to be available — is the web app running?',
  ).toBeLessThan(400);

  const band = page.getByTestId('reassurance-band');
  await expect(band).toBeVisible();
  await expect(band.getByRole('heading', { name: 'Why devotees trust us' })).toBeVisible();
  await expect(band.getByRole('listitem')).toHaveCount(3);

  const testimonials = page.getByTestId('testimonials');
  await expect(testimonials).toBeVisible();
  await expect(testimonials.getByRole('listitem')).toHaveCount(3);
  await expect(testimonials.getByText('Verified buyer').first()).toBeVisible();

  await expect(page.getByTestId('home-faq')).toBeVisible();
});

test('home FAQ expands an answer and keeps a single question open', async ({ page }) => {
  await page.goto('/');
  const faq = page.getByTestId('home-faq');
  await faq.scrollIntoViewIfNeeded();

  const delivery = faq.getByRole('button', { name: /what areas do you deliver/i });
  const returns = faq.getByRole('button', { name: /return policy/i });

  await expect(delivery).toHaveAttribute('aria-expanded', 'false');
  await delivery.click();
  await expect(delivery).toHaveAttribute('aria-expanded', 'true');
  await expect(faq.getByText(/most orders within Chennai/)).toBeVisible();

  await returns.click();
  await expect(returns).toHaveAttribute('aria-expanded', 'true');
  await expect(delivery).toHaveAttribute('aria-expanded', 'false');
});

test('home FAQ links through to the full FAQ page', async ({ page }) => {
  await page.goto('/');
  const faq = page.getByTestId('home-faq');
  await faq.scrollIntoViewIfNeeded();

  await faq.getByRole('link', { name: 'See all questions' }).click();
  await expect(page).toHaveURL(/\/pages\/faq/);
  await expect(page.locator('h1')).toBeVisible();
});
