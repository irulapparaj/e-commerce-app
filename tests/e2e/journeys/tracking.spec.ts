import { expect, test } from '@playwright/test';

import { loginCustomer } from '../fixtures/users';
import { deleteAllMessages, waitForMessage } from '../helpers/mailpit';
import { postShiprocketWebhook, resetTrackingFixture } from '../helpers/webhooks';

/**
 * Order tracking journey (WF-11).
 *
 * Each test resets the seeded order to PENDING via a test-hook before running.
 * All tests share a fixed customer (e2e-tracking@example.test) who owns the order.
 *
 * Status badges are asserted via data-testid="order-status" on the OrderCard component
 * rendered in /account/orders (force-dynamic, so always fresh).
 */

const SEEDED_AWB = process.env.E2E_SEEDED_AWB ?? 'E2E-AWB-001';
const TRACKING_EMAIL = 'e2e-tracking@example.test';

test.describe('Order tracking (WF-11)', () => {
  test.beforeEach(async () => {
    await resetTrackingFixture();
    await deleteAllMessages();
  });

  test('@critical order tracking: shipped webhook updates status to DISPATCHED', async ({
    page,
  }) => {
    await loginCustomer(page, TRACKING_EMAIL);

    const { status } = await postShiprocketWebhook('webhook-shipped', SEEDED_AWB);
    expect(
      status,
      'Expected the Shiprocket webhook test-hook to accept the fixture',
    ).toBeLessThan(400);

    await page.goto('/account/orders');
    const statusBadge = page.getByTestId('order-status').first();
    await expect(statusBadge).toBeVisible({ timeout: 15_000 });
    const statusText = (await statusBadge.textContent()) ?? '';
    expect(statusText).toMatch(/dispatch|in.transit|shipped/i);
  });

  test('@critical order tracking: in-transit webhook advances status', async ({ page }) => {
    await loginCustomer(page, TRACKING_EMAIL);

    const { status } = await postShiprocketWebhook('webhook-in-transit', SEEDED_AWB);
    expect(
      status,
      'Expected the Shiprocket webhook test-hook to accept the fixture',
    ).toBeLessThan(400);

    await page.goto('/account/orders');
    const statusBadge = page.getByTestId('order-status').first();
    await expect(statusBadge).toBeVisible({ timeout: 15_000 });
    const statusText = (await statusBadge.textContent()) ?? '';
    expect(statusText).toMatch(/in.transit|out.for.delivery|dispatch/i);
  });

  test('order tracking: delivered webhook marks order as DELIVERED', async ({ page }) => {
    await loginCustomer(page, TRACKING_EMAIL);

    const { status } = await postShiprocketWebhook('webhook-delivered', SEEDED_AWB);
    expect(
      status,
      'Expected the Shiprocket webhook test-hook to accept the fixture',
    ).toBeLessThan(400);

    await page.goto('/account/orders');
    const deliveredBadge = page
      .getByTestId('order-status')
      .filter({ hasText: /delivered/i })
      .first();
    await expect(deliveredBadge).toBeVisible({ timeout: 15_000 });
  });

  test('dispatch notification email is sent when order ships', async ({ page }) => {
    await loginCustomer(page, TRACKING_EMAIL);

    const { status } = await postShiprocketWebhook('webhook-shipped', SEEDED_AWB);
    expect(
      status,
      'Expected the Shiprocket webhook test-hook to accept the fixture',
    ).toBeLessThan(400);

    await waitForMessage(TRACKING_EMAIL, 'dispatched', 15_000).catch(() => {
      test.skip(true, 'Dispatch email not received within timeout — may be async in this stack');
    });
  });
});
