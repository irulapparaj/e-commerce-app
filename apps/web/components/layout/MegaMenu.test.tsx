// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { categoryTree } from '@/test-utils/storefront';

import { HOVER_INTENT_MS, MegaMenu } from './MegaMenu';
import { panelImage, splitColumns } from './MegaMenuPanel';

const trigger = (name: string) => screen.getByRole('button', { name });

describe('MegaMenu helpers', () => {
  it('splits children into two balanced columns and picks the first available image', () => {
    expect(splitColumns([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(splitColumns([])).toEqual([[], []]);
    expect(panelImage(categoryTree[0]!)).toContain('agarbatti-640');
    expect(panelImage(categoryTree[1]!)).toContain('wet-dhoop-640');
    expect(panelImage(categoryTree[2]!)).toBeNull();
  });
});

describe('MegaMenu', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing without categories and plain links for leaf categories', () => {
    const { rerender } = renderWithIntl(<MegaMenu categories={[]} />);
    expect(screen.queryByRole('navigation')).toBeNull();

    rerender(<MegaMenu categories={categoryTree} />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gifting' })).toHaveAttribute(
      'href',
      '/collections/gifting',
    );
    expect(trigger('Agarbatti')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click with the panel wired via aria-controls, two columns, image and explore-all', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MegaMenu categories={categoryTree} />);

    await user.click(trigger('Agarbatti'));

    const button = trigger('Agarbatti');
    const panel = screen.getByTestId('mega-menu-panel-agarbatti');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', button.id);
    expect(panel.querySelectorAll('ul')).toHaveLength(2);
    expect(panel.querySelectorAll('ul')[0]?.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Agarbatti collection' })).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(screen.getByTestId('explore-all-agarbatti')).toHaveAttribute(
      'href',
      '/collections/agarbatti',
    );
    expect(trigger('Agarbatti')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Bambooless' })).toHaveFocus();

    await user.click(trigger('Agarbatti'));
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
  });

  it('shows a placeholder when no image exists', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MegaMenu categories={categoryTree} />);
    await user.click(trigger('Puja Samagri'));
    expect(screen.getByTestId('mega-menu-image-placeholder')).toBeInTheDocument();
  });

  it('is fully keyboard operable: arrows, Enter, ArrowDown, ↑/↓ inside, Escape returns focus', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MegaMenu categories={categoryTree} />);

    await user.tab();
    expect(trigger('Agarbatti')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(trigger('Dhoop')).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('link', { name: 'Gifting' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(trigger('Agarbatti')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('link', { name: 'Gifting' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(trigger('Agarbatti')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(trigger('Agarbatti')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Bambooless' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Premium' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByTestId('explore-all-agarbatti')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
    expect(trigger('Agarbatti')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Bambooless' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger('Agarbatti')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger('Agarbatti')).toHaveFocus();
  });

  it('moves an open panel along with ArrowRight and closes when focus leaves the nav', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <>
        <MegaMenu categories={categoryTree} />
        <button type="button">after</button>
      </>,
    );

    await user.tab();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowRight}');
    expect(trigger('Dhoop')).toHaveFocus();
    expect(screen.queryByTestId('mega-menu-panel-dhoop')).toBeNull();

    await user.click(trigger('Dhoop'));
    expect(screen.getByTestId('mega-menu-panel-dhoop')).toBeInTheDocument();
    expect(trigger('Dhoop')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(trigger('Agarbatti')).toHaveFocus();
    expect(screen.queryByTestId('mega-menu-panel-dhoop')).toBeNull();
    expect(screen.getByTestId('mega-menu-panel-agarbatti')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'after' }));
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
  });

  it('closes after following a link in the panel', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MegaMenu categories={categoryTree} />);
    await user.click(trigger('Dhoop'));
    await user.click(screen.getByRole('link', { name: 'Dhoop Cones' }));
    expect(screen.queryByTestId('mega-menu-panel-dhoop')).toBeNull();
  });

  it('opens and closes with 120 ms hover intent, ignoring touch', () => {
    vi.useFakeTimers();
    renderWithIntl(<MegaMenu categories={categoryTree} />);
    const item = trigger('Agarbatti').closest('li')!;

    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
    });
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('mega-menu-panel-agarbatti')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId('mega-menu'), { pointerType: 'mouse' });
    fireEvent.pointerEnter(trigger('Dhoop').closest('li')!, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_MS);
    });
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
    expect(screen.getByTestId('mega-menu-panel-dhoop')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId('mega-menu'), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_MS);
    });
    expect(screen.queryByTestId('mega-menu-panel-dhoop')).toBeNull();

    fireEvent.pointerEnter(item, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_MS);
    });
    expect(screen.queryByTestId('mega-menu-panel-agarbatti')).toBeNull();
  });
});
