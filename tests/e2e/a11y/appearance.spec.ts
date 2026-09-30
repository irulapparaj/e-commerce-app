import { expect, test } from '@playwright/test';

import { blockingViolations } from '../helpers/axe';

/** Every skin must clear the same axe bar as the classic design, in both themes, menu open or shut. */
const SKINS = ['mandir-gold', 'pushpa-purity', 'utsav-rang', 'sandhya-aarti'] as const;
const THEMES = ['light', 'dark'] as const;
const DEFAULT_ORIGIN = 'http://localhost:3000';

test.describe('look-and-feel accessibility', () => {
  for (const skin of SKINS) {
    test(`home in ${skin} has no serious or critical axe violations in both themes`, async ({
      page,
      context,
      baseURL,
    }) => {
      const url = baseURL ?? DEFAULT_ORIGIN;
      for (const theme of THEMES) {
        await context.addCookies([
          { name: 'skin', value: skin, url },
          { name: 'theme', value: theme, url },
        ]);
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await blockingViolations(page), `${skin} in ${theme}`).toEqual([]);
      }
    });
  }

  test('the open look-and-feel menu is axe clean and moves focus in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Change look and feel' }).click();

    const dialog = page.getByRole('dialog', { name: 'Look & feel' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('skin-drawer-close')).toBeFocused();
    await expect(dialog.getByRole('radio')).toHaveCount(SKINS.length + 1);
    expect(await blockingViolations(page)).toEqual([]);

    await dialog.getByText('Sandhya Aarti', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'sandhya-aarti');
    expect(await blockingViolations(page)).toEqual([]);
  });
});
