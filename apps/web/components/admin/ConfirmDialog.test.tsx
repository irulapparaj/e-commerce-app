// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('is an accessible modal that focuses cancel first, traps Tab and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <>
        <button type="button">outside</button>
        <ConfirmDialog
          open
          title="Revoke sessions?"
          body={<p>They will need to sign in again.</p>}
          confirmLabel="Revoke"
          destructive
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Revoke sessions?' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('They will need to sign in again.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Revoke' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Revoke' })).toHaveClass('admin-btn-danger');
    await user.click(screen.getByTestId('confirm-accept'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape, on the cancel button and on a backdrop click', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="T" body="B" onConfirm={() => undefined} onCancel={onCancel} />,
    );

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('dialog').parentElement!);
    await user.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('renders nothing when closed and disables buttons while busy', () => {
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="T"
        body="B"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <ConfirmDialog
        open
        busy
        title="T"
        body="B"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
