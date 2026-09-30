// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Button } from './Button';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('is a labelled, described modal that prefers [data-autofocus] and restores focus on close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = renderWithIntl(
      <>
        <button type="button" data-testid="opener">
          open
        </button>
        <Dialog
          open
          onClose={onClose}
          title="Remove this item?"
          description="You can add it back later."
          actions={
            <>
              <Button variant="ghost" onClick={onClose}>
                Keep it
              </Button>
              <Button data-autofocus>Remove</Button>
            </>
          }
        >
          <p>Body</p>
        </Dialog>
      </>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Remove this item?' });
    expect(dialog).toHaveAccessibleDescription('You can add it back later.');
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
    expect(screen.getByTestId('opener').parentElement).toHaveAttribute('inert');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog open={false} onClose={onClose} title="Remove this item?">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.children[0]).not.toHaveAttribute('inert');
  });

  it('closes on the close button and backdrop only', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(
      <Dialog open onClose={onClose} title="T" size="sm">
        <p>Body</p>
      </Dialog>,
    );

    await user.click(screen.getByTestId('dialog-close'));
    await user.click(screen.getByTestId('dialog-backdrop'));
    await user.click(screen.getByText('Body'));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-sm');
  });

  it('keeps focus on the panel itself when it has no focusable children', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Dialog open onClose={() => undefined} title="Static" testId="static">
        <p>Nothing to press</p>
      </Dialog>,
    );
    // The close button is always present; disable it to simulate an empty panel.
    screen.getByTestId('static-close').setAttribute('disabled', '');
    screen.getByTestId('static').focus();

    await user.tab();

    expect(screen.getByTestId('static')).toHaveFocus();
  });
});
