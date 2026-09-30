// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { GalleryButtons, GalleryCommerce, GalleryFields } from '@/components/dev/GalleryControls';
import { GalleryNavigation } from '@/components/dev/GalleryNavigation';
import { GalleryOverlays } from '@/components/dev/GalleryOverlays';
import { renderWithIntl } from '@/test-utils/intl';

import { IconSprite } from './Icon';
import { ToastProvider } from './Toast';

const BLOCKING = new Set(['serious', 'critical']);

/** jsdom has no layout, so colour contrast is checked by the Playwright a11y spec instead. */
const blockingViolations = async (root: HTMLElement) => {
  const results = await axe(root, {
    rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
  });
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(' | ')}`);
};

describe('gallery components pass axe', () => {
  it('buttons, fields, badges, prices and steppers', async () => {
    const { container } = renderWithIntl(
      <main>
        <IconSprite />
        <GalleryButtons />
        <GalleryFields />
        <GalleryCommerce />
      </main>,
    );
    expect(await blockingViolations(container)).toEqual([]);
  });

  it('tabs, accordion, breadcrumb, pagination, links, icons and skeletons', async () => {
    const { container } = renderWithIntl(
      <main>
        <IconSprite />
        <GalleryNavigation />
      </main>,
    );
    expect(await blockingViolations(container)).toEqual([]);
  });

  it('drawer, dialog and toasts while open', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ToastProvider>
        <main>
          <IconSprite />
          <GalleryOverlays />
        </main>
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Success toast' }));
    await user.click(screen.getByTestId('gallery-open-drawer'));
    expect(await blockingViolations(document.body)).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('gallery-open-dialog'));
    expect(await blockingViolations(document.body)).toEqual([]);
  });
});
