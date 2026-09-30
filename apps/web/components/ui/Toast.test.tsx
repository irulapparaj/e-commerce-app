// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Button } from './Button';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const { notify } = useToast();
  return (
    <>
      <Button onClick={() => notify('Added to cart', { tone: 'success' })}>ok</Button>
      <Button onClick={() => notify('Payment failed', { tone: 'critical', durationMs: 1000 })}>
        fail
      </Button>
    </>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces notifications in a polite live region, dismisses on click and after the timeout', () => {
    renderWithIntl(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('Payment failed')).toHaveClass('text-critical');

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(screen.queryByText('Added to cart')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryAllByRole('status')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithIntl(<Trigger />)).toThrow(
      'useToast must be used inside <ToastProvider>',
    );
  });
});
