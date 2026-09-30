// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepUpProvider } from './StepUpProvider';
import { TopBar } from './TopBar';

const user = { email: 'admin@example.test', role: 'ADMIN', mfaEnabled: true, name: 'Asha' };

afterEach(() => {
  vi.useRealTimers();
});

describe('TopBar', () => {
  it('shows the environment badge and a user menu with email, role, MFA status and sign-out actions', async () => {
    const ui = userEvent.setup();
    render(
      <StepUpProvider>
        <TopBar environment="development" user={user} />
      </StepUpProvider>,
    );

    expect(screen.getByTestId('env-badge')).toHaveTextContent('development');
    const trigger = screen.getByRole('button', { name: /admin@example.test/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await ui.click(trigger);

    const panel = screen.getByTestId('user-panel');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveTextContent('Asha');
    expect(panel).toHaveTextContent('ADMIN');
    expect(panel).toHaveTextContent('Enrolled');
    expect(panel).toHaveTextContent('Not active');
    expect(screen.getByTestId('sign-out')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-all')).toBeInTheDocument();

    await ui.keyboard('{Escape}');
    expect(screen.queryByTestId('user-panel')).toBeNull();
    await ui.click(trigger);
    await ui.click(document.body);
    expect(screen.queryByTestId('user-panel')).toBeNull();
  });

  it('shows a live mm:ss countdown of the step-up window that hides at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const exp = Math.floor(Date.now() / 1000) + 65;
    render(
      <StepUpProvider initialStepUpExp={exp}>
        <TopBar environment="production" user={{ ...user, mfaEnabled: false, name: null }} />
      </StepUpProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /admin@example.test/ }));
    expect(screen.getByTestId('stepup-countdown')).toHaveTextContent('01:05 left');
    expect(screen.getByTestId('user-panel')).toHaveTextContent('Not enrolled');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('stepup-countdown')).toHaveTextContent('00:05 left');
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.queryByTestId('stepup-countdown')).toBeNull();
    expect(screen.getByTestId('user-panel')).toHaveTextContent('Not active');
  });
});
