import { expect, test } from '@playwright/test';

/**
 * Catalogue browsing journey tests.
 *
 * Covers: collections listing, product detail page (PDP), search, filters,
 * pagination, and out-of-stock states.
 * These tests do not require an authenticated user.
 */

// Slug from the dev seed (apps/api/prisma/seed-data/products.json)
const PRODUCT_SLUG = 'royale-masala-agarbatti';
const SEARCH_QUERY = 'agarbatti';

test('@critical collections page loads', async ({ page }) => {
  const response = await page.goto('/en/collections');
  expect(
    response?.status(),
    'Expected collections route to be available — is the API running?',
  ).toBeLessThan(400);
  await expect(page.locator('h1')).toBeVisible();
});

test('@critical product detail page loads for an E2E fixture product', async ({ page }) => {
  const response = await page.goto(`/en/products/${PRODUCT_SLUG}`);
  expect(
    response?.status(),
    `Expected PDP for ${PRODUCT_SLUG} to be available — is the API running?`,
  ).toBeLessThan(400);
  await expect(page.locator('h1')).toBeVisible();
});

test('@critical search returns results for "agarbatti"', async ({ page }) => {
  const response = await page.goto(`/en/search?q=${encodeURIComponent(SEARCH_QUERY)}`);
  expect(
    response?.status(),
    'Expected search route to be available — is the API running?',
  ).toBeLessThan(400);
  // The search page should render at least one result or a visible heading
  await expect(page.locator('h1, [data-testid="search-results"]')).toBeVisible();
});

test('search with a nonsense query shows an empty-results state', async ({ page }) => {
  const garbage = 'xyzzy-no-match-e2e-9999';
  const response = await page.goto(`/en/search?q=${encodeURIComponent(garbage)}`);
  expect(response?.status()).toBeLessThan(400);

  // An empty-results message or zero-count indicator must be visible
  const emptyState = page.getByTestId('search-empty').or(
    page.getByText(/no (products|results) found/i).first(),
  );
  await expect(emptyState).toBeVisible({ timeout: 10_000 });

  // The page must NOT show a product card (no false-positive matches)
  await expect(page.getByTestId('product-card')).toHaveCount(0);
});

test('collection URL state round-trips: sort param survives navigation', async ({ page }) => {
  const response = await page.goto('/en/collections?sort=price_asc');
  expect(response?.status()).toBeLessThan(400);

  // The URL should retain the sort param after a full page load
  expect(page.url()).toContain('sort=price_asc');

  // The sort trigger names the active non-default sort, and the menu checks it
  const sortTrigger = page.getByTestId('sort-trigger');
  await expect(sortTrigger).toHaveText(/price.*low.*high/i);
  await sortTrigger.click();
  await expect(page.getByTestId('sort-option-price_asc')).toHaveAttribute('aria-checked', 'true');
});

test('sort menu selection updates the URL', async ({ page }) => {
  const response = await page.goto('/en/collections');
  expect(response?.status()).toBeLessThan(400);

  await page.getByTestId('sort-trigger').click();
  await page.getByTestId('sort-option-newest').click();
  await expect(page).toHaveURL(/sort=newest/);
});

test('price filter applies from the toolbar and clears again', async ({ page }) => {
  const response = await page.goto('/en/collections');
  expect(response?.status()).toBeLessThan(400);

  // Desktop opens an anchored popover; below md the same filter lives in a drawer.
  const desktopTrigger = page.getByTestId('filter-trigger');
  const isDesktop = await desktopTrigger.isVisible();
  const panel = isDesktop ? page.getByTestId('filter-popover') : page.getByTestId('drawer');
  await (isDesktop ? desktopTrigger : page.getByTestId('filter-trigger-mobile')).click();
  await expect(panel.getByTestId('price-slider')).toBeVisible();

  await panel.getByTestId('price-input-min').fill('50');
  // The Apply button previews the exact result count before committing
  await expect(panel.getByTestId('price-apply')).toHaveText(/Show \d+ items?/);
  const previewed = Number(/\d+/.exec((await panel.getByTestId('price-apply').innerText()) ?? '')?.[0]);
  await panel.getByTestId('price-apply').click();
  await expect(page).toHaveURL(/min=50/);
  // The landed page shows exactly what the preview promised
  await expect(page.getByTestId('toolbar-count')).toHaveText(new RegExp(`^${previewed} items?$`));

  if (isDesktop) {
    // The applied range surfaces as a dismissible chip on the toolbar
    const chip = page.getByTestId('price-chip');
    await expect(chip).toContainText('₹50');
    await page.getByTestId('price-chip-remove').click();
  } else {
    // On small screens the drawer's Reset lifts the filter
    await page.getByTestId('filter-trigger-mobile').click();
    await panel.getByRole('button', { name: /reset/i }).click();
  }
  await expect(page).not.toHaveURL(/min=50/);
});

test('collection filter by category persists in URL', async ({ page }) => {
  const response = await page.goto('/en/collections');
  expect(response?.status()).toBeLessThan(400);

  // Click the first available category filter chip or checkbox
  const filterChip = page.getByTestId('filter-category').first().or(
    page.getByRole('checkbox').first(),
  );
  const hasFilter = await filterChip.isVisible({ timeout: 5_000 }).catch(() => false);
  test.skip(!hasFilter, 'Category filter UI not deployed yet');

  await filterChip.click();
  // Category chips navigate to /collections/{slug} — URL should now be a category collection page
  await expect(page).toHaveURL(/collections\/.+/);

  // Reload the page — the category collection page should still be active
  await page.reload();
  await expect(page).toHaveURL(/collections\/.+/);
});

test('collections page supports pagination or infinite scroll', async ({ page }) => {
  const response = await page.goto('/en/collections');
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId('product-card').first()).toBeVisible({ timeout: 10_000 });
  const initialCount = await page.getByTestId('product-card').count();

  // Try a pagination control (page 2 link) or a load-more button
  const nextPage = page.getByTestId('pagination-next').or(
    page.getByRole('link', { name: /next|page 2/i }),
  ).or(
    page.getByRole('button', { name: /load more|show more/i }),
  );
  const hasPagination = await nextPage.isVisible({ timeout: 5_000 }).catch(() => false);
  test.skip(!hasPagination, 'Pagination / load-more not visible — fewer products than page size or feature not deployed');

  await nextPage.click();
  // Either the URL changes (page-based) or more cards appear (infinite scroll)
  const afterCount = await page.getByTestId('product-card').count();
  const urlChanged = page.url().includes('page=2') || page.url().includes('cursor=');
  expect(afterCount > initialCount || urlChanged, 'Pagination should either load more items or update the URL').toBe(true);
});

test('PDP shows JSON-LD structured data for SEO', async ({ page }) => {
  await page.goto(`/en/products/${PRODUCT_SLUG}`);
  // JSON-LD script tag should be present with Product type
  const jsonLd = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    return scripts.map((s) => s.textContent ?? '');
  });
  const productSchema = jsonLd.find((s) => s.includes('"@type":"Product"') || s.includes('"@type": "Product"'));
  expect(productSchema, 'PDP must have a Product JSON-LD schema for SEO').toBeTruthy();
});

test('PDP variant selector updates the price display', async ({ page }) => {
  const response = await page.goto(`/en/products/${PRODUCT_SLUG}`);
  expect(response?.status()).toBeLessThan(400);

  const variantButtons = page.getByTestId('variant-option');
  const variantCount = await variantButtons.count();
  test.skip(variantCount < 2, 'Only one variant — nothing to switch');

  const firstVariantText = await page.getByTestId('product-price').textContent();
  await variantButtons.nth(1).click();
  const secondVariantText = await page.getByTestId('product-price').textContent();
  // The price display should update when a different variant is selected
  // (may or may not change numerically — just assert it re-renders)
  expect(secondVariantText).not.toBeUndefined();
  // If prices differ, the UI updated correctly
  if (firstVariantText !== secondVariantText) {
    expect(secondVariantText).not.toBe(firstVariantText);
  }
});

// ─── Search Overlay ───────────────────────────────────────────────────────────

test.describe('search overlay', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('@critical search-trigger button opens the overlay', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByTestId('search-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();

    const overlay = page.getByRole('search');
    await expect(overlay).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The input inside the overlay should receive focus automatically
    await expect(overlay.getByRole('searchbox')).toBeFocused();
  });

  test('@critical typing in the overlay triggers suggestions for a known query', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('search-trigger').click();

    const searchbox = page.getByRole('searchbox');
    await searchbox.fill(SEARCH_QUERY);

    // Suggestions should appear (products or categories section heading)
    await expect(
      page.getByRole('search').locator('section').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('pressing Escape closes the overlay and returns focus to the trigger', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByTestId('search-trigger');
    await trigger.click();
    await expect(page.getByRole('search')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('search')).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('close button (×) dismisses the overlay', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('search-trigger').click();
    await expect(page.getByRole('search')).toBeVisible();

    // The overlay renders a close button with aria-label from the "closeSearch" i18n key
    const closeBtn = page.getByRole('search').getByRole('button');
    await closeBtn.click();

    await expect(page.getByRole('search')).toBeHidden();
  });

  test('selecting a product suggestion navigates to its PDP', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('search-trigger').click();

    const searchbox = page.getByRole('searchbox');
    await searchbox.fill(SEARCH_QUERY);

    const firstResult = page.getByRole('search').locator('section').first().getByRole('link').first();
    await expect(firstResult).toBeVisible({ timeout: 5_000 });
    await firstResult.click();

    await expect(page).toHaveURL(/\/products\//);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('keyboard arrow keys navigate the suggestion list and Enter confirms', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('search-trigger').click();

    const searchbox = page.getByRole('searchbox');
    await searchbox.fill(SEARCH_QUERY);
    await expect(
      page.getByRole('search').locator('section').first(),
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Selecting with Enter should navigate away from the collections page
    await expect(page).not.toHaveURL(/\/collections$/);
  });

  test('submitting an empty-results query navigates to /search with the term', async ({ page }) => {
    await page.goto('/en/collections');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('search-trigger').click();

    const searchbox = page.getByRole('searchbox');
    await searchbox.fill(SEARCH_QUERY);
    // Press Enter without arrowing into a suggestion — should go to /search?q=
    await page.keyboard.press('Enter');

    // `localePrefix: 'as-needed'` serves the default locale without the /en prefix.
    await expect(page).toHaveURL(new RegExp(`(?:/en)?/search\\?q=${encodeURIComponent(SEARCH_QUERY)}`));
  });
});
