import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { authenticator } from 'otplib';

import { ADMIN_EMAIL } from './helpers/admin';
import { deleteAllMessages, readOtp } from './helpers/mailpit';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const CATALOGUE_CSV = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/catalogue.csv');

/** Poll readyz until the API is up or timeout. */
const waitForApi = async (): Promise<void> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/readyz`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`API at ${API_URL} did not become ready within 120 s`);
};

/** Poll web readyz until the web app is up or timeout. */
const waitForWeb = async (): Promise<void> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Web at ${BASE_URL} did not become ready within 120 s`);
};

/**
 * Login as admin via OTP → TOTP, persist the TOTP secret, return the open
 * browser and page so the caller can continue (e.g. to upload a catalogue).
 */
const adminLogin = async (): Promise<{
  browser: import('@playwright/test').Browser;
  page: import('@playwright/test').Page;
  secret: string;
}> => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: BASE_URL });

  await deleteAllMessages();
  await page.goto('/admin/login');

  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.click('button:has-text("Send code")');
  await page.waitForSelector('[data-testid="otp"]', { timeout: 15_000 });

  const otp = await readOtp(ADMIN_EMAIL);
  await page.fill('[data-testid="otp"]', otp);
  await page.click('button:has-text("Continue")');

  await page.waitForSelector('[data-testid="totp"]', { timeout: 30_000 });
  const enrolling = await page.isVisible('[data-testid="totp-secret"]');
  const knownSecret = process.env.E2E_ADMIN_TOTP_SECRET;
  const secret = enrolling
    ? ((await page.textContent('[data-testid="totp-secret"]'))?.trim() ?? '')
    : (knownSecret ?? '');

  if (!secret) {
    await browser.close();
    throw new Error('[global-setup] No TOTP secret available — reset admin MFA or set E2E_ADMIN_TOTP_SECRET');
  }

  await page.fill('[data-testid="totp"]', authenticator.generate(secret));
  await page.click('button:has-text("Continue")');
  await page.waitForURL(/\/admin$/, { timeout: 30_000 });

  process.env.E2E_ADMIN_TOTP_SECRET = secret;
  return { browser, page, secret };
};

/**
 * Login as admin and capture the TOTP secret without uploading a catalogue.
 * Resets admin MFA first so enrollment always shows the fresh secret.
 * Also resets the injectable test clock in case a prior test left it advanced
 * (which would break TOTP verification).
 * Used when the catalogue already has products from the dev-stack seed.
 */
const captureAdminTotpSecret = async (): Promise<void> => {
  // Reset the clock first so TOTP verification uses real time.
  await fetch(`${API_URL}/__test__/clock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now: null }),
  });

  // Reset admin MFA so the login shows the enrollment screen with a fresh secret.
  const resetRes = await fetch(`${API_URL}/__test__/admin-mfa-reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!resetRes.ok) {
    throw new Error(`[global-setup] Admin MFA reset failed: HTTP ${resetRes.status}`);
  }
  const { browser } = await adminLogin();
  await browser.close();
  console.warn('[global-setup] Admin TOTP secret captured.');
};

/**
 * Login as admin, upload the 50-product catalogue.csv, wait for APPLIED,
 * and persist the TOTP secret to the environment so specs can skip re-enrolment.
 */
const loadCatalogue = async (): Promise<void> => {
  const { browser, page } = await adminLogin();

  try {
    // Navigate to import
    await page.goto('/admin/import');
    await page.waitForSelector('[data-testid="import-file-input"]', { timeout: 10_000 });
    await page.setInputFiles('[data-testid="import-file-input"]', CATALOGUE_CSV);
    await page.waitForURL(/\/admin\/import\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // Wait for VALIDATED
    await page.waitForSelector('[data-testid="import-status"]:text("VALIDATED")', {
      timeout: 90_000,
    });

    // Apply
    await page.click('[data-testid="import-apply"]');
    await page.waitForSelector('[data-testid="import-status"]:text("APPLIED")', {
      timeout: 90_000,
    });

    console.warn('[global-setup] 50-product catalogue loaded successfully');
  } catch (err) {
    console.error(`[global-setup] Catalogue load failed: ${String(err)}`);
    await browser.close();
    throw err;
  }
  await browser.close();
};

export default async (): Promise<void> => {
  console.warn('[global-setup] Waiting for API…');
  await waitForApi();
  console.warn('[global-setup] Waiting for web…');
  await waitForWeb();

  // Check if the catalogue already has products (e.g. from the dev DB seed).
  // Only run the admin CSV import when the catalogue is empty.
  const preCheckRes = await fetch(`${API_URL}/api/v1/products?limit=12`);
  const preCheckBody = preCheckRes.ok
    ? ((await preCheckRes.json()) as { meta?: { total?: number } })
    : null;
  const preCount = preCheckBody?.meta?.total ?? 0;

  if (preCount > 0) {
    console.warn(`[global-setup] Catalogue already has ${preCount} product(s) — skipping CSV import.`);
    // Still login as admin to capture the TOTP secret needed by admin specs.
    await captureAdminTotpSecret();
  } else {
    console.warn('[global-setup] Loading catalogue via admin CSV import…');
    await loadCatalogue();
  }

  // Final catalogue verification.
  const catalogueRes = await fetch(`${API_URL}/api/v1/products?limit=12`);
  if (!catalogueRes.ok) {
    throw new Error(`[global-setup] Catalogue check request failed: HTTP ${catalogueRes.status}`);
  }
  const catalogueBody = (await catalogueRes.json()) as { meta?: { total?: number } };
  const total = catalogueBody?.meta?.total ?? 0;
  if (total === 0) {
    throw new Error(
      '[global-setup] Catalogue is empty — E2E suite aborted to prevent vacuous test results',
    );
  }
  console.warn(`[global-setup] Catalogue verified: ${total} product(s) present.`);
  console.warn('[global-setup] Done.');
};
