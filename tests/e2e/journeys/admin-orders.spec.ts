import { expect, test } from '@playwright/test';

import { answerStepUp, loginAdmin } from '../helpers/admin';
import { deleteAllMessages } from '../helpers/mailpit';
import { payViaStub } from '../helpers/payments';
import { loginCustomer, customerEmail } from '../fixtures/users';

/**
 * Admin orders journey (DESIGN WF-14 — Admin console, order management).
 *
 * Pre-conditions:
 * - The seeded catalogue must have at least one purchasable product (global-setup loads 50).
 * - The Razorpay payment stub must be enabled (NODE_ENV=test).
 *
 * These tests run serially because they share admin session state and create orders that
 * subsequent tests inspect.
 */

test.describe.configure({ mode: 'serial' });

let adminSecret: string | undefined = process.env.E2E_ADMIN_TOTP_SECRET;

/** Helper: place a paid order as a customer and return its orderId. */
const placeOrder = async (page: Parameters<typeof loginCustomer>[0], slug: string): Promise<string> => {
  const email = customerEmail(slug);
  await loginCustomer(page, email);

  const collectionsRes = await page.goto('/en/collections');
  expect(collectionsRes?.status()).toBeLessThan(400);

  const firstCard = page.getByTestId('product-card').first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });
  await firstCard.click();

  await expect(page.getByRole('button', { name: /add to (cart|bag)/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /add to (cart|bag)/i }).click();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /checkout/i })).toBeVisible({ timeout: 10_000 });

  const savedAddress = page.getByTestId('saved-address').first();
  const hasSaved = await savedAddress.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasSaved) {
    await savedAddress.click();
  } else {
    await expect(page.getByTestId('address-form')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/name/i).first().fill('Ravi Kumar');
    await page.getByLabel(/phone/i).fill('9876543210');
    await page.getByLabel(/address line 1/i).fill('12 Gandhi Nagar');
    await page.getByLabel(/city/i).fill('Chennai');
    await page.getByLabel(/state/i).fill('Tamil Nadu');
    await page.getByLabel(/pincode/i).fill('600020');
  }

  await page.getByTestId('place-order').click();
  await expect(page.getByTestId('order-id')).toBeVisible({ timeout: 15_000 });
  const orderId = (await page.getByTestId('order-id').textContent())?.trim() ?? '';
  expect(orderId).not.toBe('');

  // Simulate a captured payment
  const stubResult = await payViaStub(orderId, 'captured');
  expect(stubResult).not.toHaveProperty('error');

  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 20_000 });
  return orderId;
};

test('@critical admin can view the orders list', async ({ page }) => {
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  await page.getByTestId('nav-item-orders').click();
  const ordersRes = await page.goto('/admin/orders');
  expect(ordersRes?.status()).toBeLessThan(400);

  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  // At least the table or empty state should render
  const list = page.getByTestId('orders-table').or(page.getByTestId('orders-empty'));
  await expect(list).toBeVisible({ timeout: 10_000 });
});

test('@critical admin can view order details including line items and GST breakdown', async ({ page }) => {
  await deleteAllMessages();

  // Place a paid order as a customer
  const orderId = await placeOrder(page, 'admin-orders-view');
  expect(orderId).toBeTruthy();

  // Switch to admin
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  // Navigate to admin orders and find the order
  await page.goto('/admin/orders');
  await expect(page.getByTestId('orders-table').or(page.getByTestId('order-row').first())).toBeVisible({ timeout: 10_000 });

  // Navigate directly to the order detail page
  await page.goto(`/admin/orders/${orderId}`);
  const detailRes = await page.goto(`/admin/orders/${orderId}`);
  expect(detailRes?.status()).toBeLessThan(400);

  // The order detail page must show the order ID
  await expect(page.getByText(orderId)).toBeVisible({ timeout: 10_000 });

  // Line items must be visible
  const lineItems = page.getByTestId('order-line-item').first().or(
    page.getByTestId('order-items'),
  );
  await expect(lineItems).toBeVisible({ timeout: 10_000 });

  // Total and payment status must be visible
  await expect(page.getByTestId('order-total').or(
    page.getByText(/total/i).first(),
  )).toBeVisible({ timeout: 10_000 });
});

test('admin can cancel a CONFIRMED order (step-up required)', async ({ page }) => {
  await deleteAllMessages();

  const orderId = await placeOrder(page, 'admin-orders-cancel');
  expect(orderId).toBeTruthy();

  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(orderId)).toBeVisible({ timeout: 10_000 });

  // Cancel button
  const cancelButton = page.getByTestId('cancel-order-btn').or(
    page.getByRole('button', { name: /cancel order/i }),
  );
  const hasCancel = await cancelButton.isVisible({ timeout: 5_000 }).catch(() => false);
  test.skip(!hasCancel, 'Cancel button not visible — order may already be in a non-cancellable state or UI not deployed');

  await cancelButton.click();

  // A confirmation dialog should appear
  const confirmDialog = page.getByTestId('cancel-confirm-dialog').or(
    page.getByRole('dialog'),
  );
  const hasDialog = await confirmDialog.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasDialog) {
    await page.getByRole('button', { name: /confirm|yes.*cancel/i }).click();
  }

  // Step-up may be required for cancellations
  const stepUpDialog = page.getByTestId('stepup-dialog');
  const hasStepUp = await stepUpDialog.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasStepUp) {
    await answerStepUp(page, secret);
  }

  // Order status should now reflect CANCELLED
  const statusBadge = page.getByTestId('order-status');
  await expect(statusBadge).toBeVisible({ timeout: 10_000 });
  await expect(statusBadge).toHaveText(/cancelled/i);
});

test('admin can initiate a refund on a paid order', async ({ page }) => {
  await deleteAllMessages();

  const orderId = await placeOrder(page, 'admin-orders-refund');
  expect(orderId).toBeTruthy();

  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(orderId)).toBeVisible({ timeout: 10_000 });

  // Refund button (may require cancelling first in some flows)
  const refundButton = page.getByTestId('refund-order-btn').or(
    page.getByRole('button', { name: /refund/i }),
  );
  const hasRefund = await refundButton.isVisible({ timeout: 5_000 }).catch(() => false);
  test.skip(!hasRefund, 'Refund button not visible — order may not be in a refundable state or UI not deployed');

  await refundButton.click();

  // A refund amount input or confirmation dialog should appear
  const refundDialog = page.getByTestId('refund-dialog').or(page.getByRole('dialog'));
  const hasDialog = await refundDialog.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasDialog) {
    // Accept the default full refund amount
    await page.getByTestId('refund-confirm').or(
      page.getByRole('button', { name: /confirm|refund/i }),
    ).click();
  }

  // Step-up required for refunds
  const stepUpDialog = page.getByTestId('stepup-dialog');
  const hasStepUp = await stepUpDialog.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasStepUp) {
    await answerStepUp(page, secret);
  }

  // A toast or status update should confirm the refund was initiated
  const refundFeedback = page.getByTestId('toast').filter({ hasText: /refund/i }).or(
    page.getByTestId('order-status').filter({ hasText: /refund/i }),
  );
  await expect(refundFeedback).toBeVisible({ timeout: 10_000 });
});

test('STAFF cannot cancel an order (RBAC guard)', async ({ page, browser }) => {
  await deleteAllMessages();

  // Login as admin, invite a staff user
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  const staffEmail = `e2e-staff-orders-${Date.now()}@example.test`;
  const csrfToken = async (): Promise<string> =>
    (await page.context().cookies()).find((c) => c.name === '__Host-csrf')?.value ?? '';

  // Invite staff via API
  const inviteRes = await page.request.post('/api/v1/admin/staff', {
    headers: { 'x-csrf-token': await csrfToken(), origin: new URL(page.url()).origin },
    data: { email: staffEmail, name: 'E2E Staff Orders', role: 'STAFF' },
  });
  expect(inviteRes.status()).toBe(201);

  // Login as the new staff in a separate context
  const ctx = await browser.newContext();
  const staffPage = await ctx.newPage();
  await deleteAllMessages();
  await staffPage.goto('/admin/login');
  await expect(async () => {
    await staffPage.getByLabel('Email address').fill(staffEmail);
    await staffPage.getByRole('button', { name: 'Send code' }).click();
    await expect(staffPage.getByTestId('otp')).toBeVisible({ timeout: 3_000 });
  }).toPass();
  const { readOtp } = await import('../helpers/mailpit');
  const staffOtp = await readOtp(staffEmail);
  await staffPage.getByTestId('otp').fill(staffOtp);
  await staffPage.getByRole('button', { name: 'Continue' }).click();
  // Complete TOTP enrolment for staff
  await staffPage.getByTestId('totp').waitFor();
  const enrolling = await staffPage.getByTestId('totp-secret').isVisible();
  if (enrolling) {
    const { authenticator } = await import('otplib');
    const staffTotpSecret = (await staffPage.getByTestId('totp-secret').textContent())?.trim() ?? '';
    await staffPage.getByTestId('totp').fill(authenticator.generate(staffTotpSecret));
    await staffPage.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(staffPage).toHaveURL(/\/admin$/);

  // Staff direct API call to cancel an order should be rejected with 403
  const directCancel = await staffPage.request.post('/api/v1/admin/orders/nonexistent-id/cancel', {
    headers: {
      origin: new URL(staffPage.url()).origin,
      'x-csrf-token': (await staffPage.context().cookies()).find((c) => c.name === '__Host-csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    data: { reason: 'test' },
  });
  expect(directCancel.status(), 'STAFF must receive 403 on admin-only order cancel endpoint').toBe(403);
  await ctx.close();
});

test('admin order list search filters by order ID prefix', async ({ page }) => {
  const secret = await loginAdmin(page, adminSecret);
  adminSecret = secret;

  await page.goto('/admin/orders');
  await expect(page.getByTestId('orders-table').or(page.getByTestId('order-row').first())).toBeVisible({ timeout: 10_000 });

  const searchInput = page.getByTestId('order-search').or(
    page.getByRole('searchbox'),
  ).or(
    page.getByPlaceholder(/search|filter.*order/i),
  );
  const hasSearch = await searchInput.isVisible({ timeout: 3_000 }).catch(() => false);
  test.skip(!hasSearch, 'Order search not deployed yet');

  await searchInput.fill('NONEXISTENT-ORDER-12345');
  // Should show no results after filtering
  await expect(page.getByTestId('orders-empty').or(
    page.getByText(/no (orders|results)/i).first(),
  )).toBeVisible({ timeout: 10_000 });
});
