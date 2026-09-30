// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Drawer } from './Drawer';

const Harness = ({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) => (
  <>
    <button type="button" data-testid="opener">
      open
    </button>
    <Drawer
      open={open}
      onClose={onClose}
      title="My cart"
      footer={<button type="button">Checkout</button>}
    >
      <a href="/products/a">Item</a>
    </Drawer>
  </>
);

describe('Drawer', () => {
  it('renders nothing while closed', () => {
    renderWithIntl(<Harness open={false} onClose={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves focus in, makes the page inert, traps Tab, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = renderWithIntl(<Harness open={false} onClose={onClose} />);
    screen.getByTestId('opener').focus();

    rerender(<Harness open onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'My cart' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByTestId('opener').parentElement).toHaveAttribute('inert');
    expect(dialog.closest('[data-modal-root]')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Item' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Checkout' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Checkout' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} onClose={onClose} />);
    expect(screen.getByTestId('opener')).toHaveFocus();
    expect(screen.getByTestId('opener').parentElement).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from the close button and a backdrop press, but not from inside the panel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<Harness open onClose={onClose} />);

    await user.click(screen.getByTestId('drawer-close'));
    await user.click(screen.getByTestId('drawer-backdrop'));
    await user.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('slides in from the left when asked', () => {
    renderWithIntl(
      <Drawer open onClose={() => undefined} title="Menu" side="left" testId="nav">
        <p>x</p>
      </Drawer>,
    );
    expect(screen.getByTestId('nav')).toHaveClass('mr-auto');
  });
});
