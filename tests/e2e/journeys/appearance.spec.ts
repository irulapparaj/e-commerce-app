import { expect, type Page, test } from '@playwright/test';

/**
 * Look-and-feel (skin) journey. A skin re-maps the design tokens through `<html data-skin>`; the
 * header menu switches it live, the `skin` cookie carries it into SSR. No authentication needed.
 */

const SKIN_COOKIE = 'skin';
const THEME_COOKIE = 'theme';
const TRIGGER = 'Change look and feel';
const DIALOG = 'Look & feel';
const DEFAULT_ORIGIN = 'http://localhost:3000';

/** Everything but the default; `classic` is the tokens.css design with no attribute at all. */
const SKINS = [
  { id: 'mandir-gold', name: 'Mandir Gold', font: /Prata/ },
  { id: 'pushpa-purity', name: 'Pushpa Purity', font: /Cormorant/ },
  { id: 'utsav-rang', name: 'Utsav Rang', font: /Rozha/ },
  { id: 'sandhya-aarti', name: 'Sandhya Aarti', font: /Cinzel/ },
] as const;

const root = (page: Page) => page.locator('html');
const hero = (page: Page) => page.getByTestId('hero');
const trigger = (page: Page) => page.getByRole('button', { name: TRIGGER });
const dialog = (page: Page) => page.getByRole('dialog', { name: DIALOG });

const headingFont = (page: Page): Promise<string> =>
  page
    .locator('h1')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);

const skinCookie = async (page: Page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === SKIN_COOKIE);

/** The still must cover the whole band in every skin, with the copy inside it. */
const expectHeroFilled = async (page: Page): Promise<void> => {
  const band = hero(page);
  await expect(band).toBeVisible();
  const [bandBox, imageBox, ctaBox] = await Promise.all([
    band.boundingBox(),
    band.locator('img').boundingBox(),
    band.getByTestId('hero-cta').boundingBox(),
  ]);
  expect(bandBox).not.toBeNull();
  expect(imageBox?.width).toBeCloseTo(bandBox?.width ?? -1, 0);
  expect(imageBox?.height).toBeCloseTo(bandBox?.height ?? -1, 0);
  expect((ctaBox?.y ?? Infinity) + (ctaBox?.height ?? 0)).toBeLessThanOrEqual(
    (bandBox?.y ?? 0) + (bandBox?.height ?? 0) + 1,
  );
};

test('@critical the default is the classic design with no skin attribute', async ({ page }) => {
  await page.goto('/');

  await expect(root(page)).not.toHaveAttribute('data-skin');
  await expectHeroFilled(page);
  expect(await headingFont(page)).toMatch(/Fraunces/);
  await expect(trigger(page)).toHaveAttribute('data-skin-state', 'classic');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});

test('@critical picking a skin switches the page live, persists it and survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  await trigger(page).click();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');

  const menu = dialog(page);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('radio')).toHaveCount(SKINS.length + 1);
  await expect(menu.getByRole('radio', { name: /Classic/ })).toBeChecked();

  await menu.getByText('Utsav Rang', { exact: true }).click();

  await expect(root(page)).toHaveAttribute('data-skin', 'utsav-rang');
  await expect(menu.getByRole('radio', { name: /Utsav Rang/ })).toBeChecked();
  expect(await headingFont(page)).toMatch(/Rozha/);
  expect(await skinCookie(page)).toMatchObject({ value: 'utsav-rang', sameSite: 'Lax', path: '/' });
  expect(await page.evaluate(() => window.localStorage.getItem('skin'))).toBe('utsav-rang');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger(page)).toHaveAttribute('data-skin-state', 'utsav-rang');
  await expectHeroFilled(page);

  // The cookie must render the skin on the server: check the raw document, not the hydrated DOM.
  const html = await (await page.request.get('/')).text();
  expect(html).toMatch(/<html[^>]*\sdata-skin="utsav-rang"/);

  await page.reload();
  await expect(root(page)).toHaveAttribute('data-skin', 'utsav-rang');
  expect(await headingFont(page)).toMatch(/Rozha/);

  await trigger(page).click();
  await dialog(page).getByText('Classic', { exact: true }).click();

  await expect(root(page)).not.toHaveAttribute('data-skin');
  expect(await headingFont(page)).toMatch(/Fraunces/);
  expect(await skinCookie(page)).toMatchObject({ value: 'classic' });
});

test('the menu is keyboard operable: arrows move through skins and Escape returns focus', async ({
  page,
}) => {
  await page.goto('/');
  await trigger(page).focus();
  await page.keyboard.press('Enter');

  const menu = dialog(page);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('radio', { name: /Classic/ })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('radio', { name: /Mandir Gold/ })).toBeChecked();
  await expect(root(page)).toHaveAttribute('data-skin', 'mandir-gold');

  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('radio', { name: /Classic/ })).toBeChecked();
  await expect(root(page)).not.toHaveAttribute('data-skin');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger(page)).toBeFocused();
});

for (const skin of SKINS) {
  test(`the skin cookie renders ${skin.name} on the server in both themes`, async ({
    page,
    context,
    baseURL,
  }) => {
    const url = baseURL ?? DEFAULT_ORIGIN;
    for (const theme of ['light', 'dark'] as const) {
      await context.addCookies([
        { name: SKIN_COOKIE, value: skin.id, url },
        { name: THEME_COOKIE, value: theme, url },
      ]);
      await page.goto('/');

      await expect(root(page)).toHaveAttribute('data-skin', skin.id);
      await expect(root(page)).toHaveAttribute('data-theme', theme);
      expect(await headingFont(page), `${skin.id} heading face in ${theme}`).toMatch(skin.font);
      await expect(trigger(page)).toHaveAttribute('data-skin-state', skin.id);
      await expectHeroFilled(page);
    }
  });
}

test('an unknown skin cookie falls back to the default', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: SKIN_COOKIE, value: 'neon', url: baseURL ?? DEFAULT_ORIGIN }]);
  await page.goto('/');

  await expect(root(page)).not.toHaveAttribute('data-skin');
  expect(await headingFont(page)).toMatch(/Fraunces/);
  await expect(trigger(page)).toHaveAttribute('data-skin-state', 'classic');
});
