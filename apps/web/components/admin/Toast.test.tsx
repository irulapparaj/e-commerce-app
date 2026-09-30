// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './Toast';

function Notifier() {
  const { notify } = useToast();
  return (
    <div>
      <button type="button" onClick={() => notify('Saved', 'success')}>
        save
      </button>
      <button type="button" onClick={() => notify('Failed', 'critical')}>
        fail
      </button>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('announces toasts in a polite live region and lets the user dismiss them', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'save' }));
    await user.click(screen.getByRole('button', { name: 'fail' }));
    const region = screen.getByRole('status');

    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByTestId('toast')).toHaveLength(2);
    expect(screen.getAllByTestId('toast')[0]).toHaveClass('admin-toast-success');
    await user.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]!);
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(screen.getByTestId('toast')).toHaveTextContent('Failed');
  });

  it('auto-dismisses after five seconds', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(5001);
    });

    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Notifier />)).toThrow('useToast must be used inside ToastProvider');
    spy.mockRestore();
  });
});
