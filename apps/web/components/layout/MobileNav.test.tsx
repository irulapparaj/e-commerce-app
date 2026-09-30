// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { categoryTree } from '@/test-utils/storefront';

import { MobileNav } from './MobileNav';

describe('MobileNav', () => {
  it('opens a drawer with accordion levels and closes after following a link', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav categories={categoryTree} accountHref="/login" signedIn={false} />);
    const opener = screen.getByRole('button', { name: 'Open menu' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');

    await user.click(opener);

    const drawer = screen.getByRole('dialog', { name: 'Browse' });
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-controls',
      drawer.id,
    );
    expect(screen.getByRole('navigation', { name: 'Site menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gifting' })).toHaveAttribute(
      'href',
      '/collections/gifting',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    await user.click(screen.getByRole('button', { name: 'Agarbatti' }));
    expect(screen.getByRole('link', { name: 'Explore all Agarbatti' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Premium' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
  });

  it('closes on Escape, labels the account link for signed-in visitors and shows an empty state', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithIntl(
      <MobileNav categories={[]} accountHref="/account" signedIn />,
    );

    await user.click(screen.getByTestId('mobile-nav-open'));
    expect(screen.getByText('Collections are on their way.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<MobileNav categories={categoryTree} accountHref="/account" signedIn />);
    await user.click(screen.getByTestId('mobile-nav-open'));
    await user.click(screen.getByRole('link', { name: 'Account' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
