import { resolve } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { answerStepUp, loginAdmin } from '../helpers/admin';

const FIXTURES = resolve(import.meta.dirname, '../../fixtures/imports');
/** valid.csv: 3 products, 5 variant rows (see tests/fixtures/imports). */
const VALID_CREATES = 3;
const VALID_ROWS = 5;
const IMPORTED_SLUG = 'import-sandalwood-agarbatti';

/**
 * The file input is client-only: a change before hydration goes nowhere on a dev server, so the
 * upload is retried until the browser has moved to the new job page.
 */
const uploadImport = async (page: Page, file: string): Promise<void> => {
  await page.goto('/admin/import');
  await expect(async () => {
    await page.getByTestId('import-file-input').setInputFiles(resolve(FIXTURES, file));
    await expect(page).toHaveURL(/\/admin\/import\/[0-9a-f-]{36}/, { timeout: 8_000 });
  }).toPass({ timeout: 60_000 });
};

test.describe.configure({ mode: 'serial' });

/** Each test gets a new browser context; the TOTP secret enrolled by the first test carries over. */
let adminSecret: string | undefined = process.env.E2E_ADMIN_TOTP_SECRET;

test(
  'admin downloads the template, imports valid.csv after a clean dry run, and the products and IMPORT ledger rows exist',
  { tag: '@critical' },
  async ({ page }) => {
    const secret = await loginAdmin(page, adminSecret);
    adminSecret = secret;

    await page.getByTestId('nav-item-import').click();
    await expect(page).toHaveURL(/\/admin\/import$/);
    await expect(page.getByTestId('import-template-csv')).toHaveAttribute(
      'href',
      '/api/v1/admin/import/template?format=csv',
    );
    const template = await page.request.get('/api/v1/admin/import/template?format=csv');
    expect(template.status()).toBe(200);
    expect(template.headers()['content-type']).toContain('text/csv');
    expect(template.headers()['content-disposition']).toContain('product-import-template.csv');
    const firstLine = (await template.text()).replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
    expect(firstLine.startsWith('"sku","name"')).toBe(true);

    await uploadImport(page, 'valid.csv');
    await expect(page.getByTestId('import-status')).toHaveText('VALIDATED', { timeout: 60_000 });
    await expect(page.getByTestId('import-summary-rows')).toHaveText(String(VALID_ROWS));
    await expect(page.getByTestId('import-summary-creates')).toHaveText(String(VALID_CREATES));
    await expect(page.getByTestId('import-summary-errors')).toHaveText('0');
    await expect(page.getByTestId('dryrun-row')).toHaveCount(VALID_CREATES);
    await expect(page.getByTestId('dryrun-row').first()).toContainText('IMP-AG-001');

    await page.getByTestId('import-apply').click();
    await answerStepUp(page, secret);
    await expect(page.getByTestId('import-status')).toHaveText('APPLIED', { timeout: 60_000 });
    await expect(page.getByTestId('toast').filter({ hasText: 'Import applied' })).toBeVisible();
    await expect(page.getByTestId('import-apply')).toHaveCount(0);

    // Products are live on the public API (cells were text, slugs generated server-side).
    const publicDetail = await page.request.get(`/api/v1/products/${IMPORTED_SLUG}`);
    expect(publicDetail.status()).toBe(200);
    const product = (await publicDetail.json()) as { data: { variants: unknown[] } };
    expect(product.data.variants).toHaveLength(2);

    // Stock landed through the ledger as IMPORT movements, not as a bare column write.
    const movements = await page.request.get('/api/v1/admin/inventory/movements?reason=IMPORT');
    expect(movements.status()).toBe(200);
    const ledger = (await movements.json()) as {
      data: { reason: string }[];
      meta?: { total: number };
    };
    expect(ledger.meta?.total ?? ledger.data.length).toBeGreaterThanOrEqual(4);
    expect(ledger.data.every((row) => row.reason === 'IMPORT')).toBe(true);

    await page.goto('/admin/import');
    await expect(page.getByTestId('import-history-row').first()).toContainText('APPLIED');
  },
);

test('a file with row problems lists them with line numbers, refuses apply, and offers the error CSV', async ({
  page,
}) => {
  const secret = await loginAdmin(page, adminSecret);
  expect(secret).not.toBe('');

  await uploadImport(page, 'bad-rows.csv');
  await expect(page.getByTestId('import-status')).toHaveText('FAILED', { timeout: 60_000 });
  await expect(page.getByTestId('dryrun-tab-errors')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('dryrun-error-row').first()).toBeVisible();
  const lines = page.getByTestId('dryrun-error-line');
  for (const line of ['3', '4', '5', '6'])
    await expect(lines.filter({ hasText: new RegExp(`^${line}$`) }).first()).toBeVisible();
  await expect(page.getByTestId('import-apply')).toBeDisabled();
  await expect(page.getByTestId('apply-explanation')).toContainText(/fix|problems/i);

  await page.getByTestId('dryrun-errors-link').click();
  await expect(page.getByTestId('dryrun-errors-csv')).toHaveAttribute('href', /.+/);

  // The API refuses apply for a FAILED job regardless of the UI (409).
  const jobId = page.url().split('/').pop()?.split('?')[0] ?? '';
  const refused = await page.request.post(`/api/v1/admin/import/${jobId}/apply`, {
    headers: {
      origin: new URL(page.url()).origin,
      'x-csrf-token':
        (await page.context().cookies()).find((cookie) => cookie.name === '__Host-csrf')?.value ??
        '',
    },
  });
  expect([403, 409]).toContain(refused.status());
});
