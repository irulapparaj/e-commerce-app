// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as NextNavigation from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/',
    useParams: () => ({ locale: 'en' }),
  };
});

import { HomeFaq } from './HomeFaq';

describe('HomeFaq', () => {
  it('shows five questions, all collapsed, and the way to the full FAQ page', () => {
    renderWithIntl(<HomeFaq />);
    const section = screen.getByTestId('home-faq');

    expect(
      within(section).getByRole('heading', { level: 2, name: 'Common questions' }),
    ).toBeInTheDocument();

    const triggers = within(section).getAllByRole('button');
    expect(triggers).toHaveLength(5);
    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }

    expect(within(section).getByRole('link', { name: 'See all questions' })).toHaveAttribute(
      'href',
      expect.stringContaining('/pages/faq'),
    );
  });

  it('expands one answer at a time and collapses it on the second click', async () => {
    const user = userEvent.setup();
    renderWithIntl(<HomeFaq />);
    const section = screen.getByTestId('home-faq');

    const delivery = within(section).getByRole('button', { name: /what areas do you deliver/i });
    const returns = within(section).getByRole('button', { name: /return policy/i });

    await user.click(delivery);
    expect(delivery).toHaveAttribute('aria-expanded', 'true');
    expect(within(section).getByText(/most orders within Chennai/)).toBeVisible();

    // Opening a second question closes the first: one answer on screen at a time.
    await user.click(returns);
    expect(returns).toHaveAttribute('aria-expanded', 'true');
    expect(delivery).toHaveAttribute('aria-expanded', 'false');

    await user.click(returns);
    expect(returns).toHaveAttribute('aria-expanded', 'false');
    expect(within(section).queryByText(/within 15 days of delivery/)).not.toBeVisible();
  });
});
