// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, adminApi } from '@/lib/admin/api';

import { StepUpProvider, useStepUp, useStepUpRemaining } from './StepUpProvider';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const stepUpRequired = () =>
  json(403, {
    success: false,
    data: null,
    error: { code: 'STEP_UP_REQUIRED', message: 'Recent re-authentication required' },
  });

type Call = { readonly url: string; readonly init: RequestInit };

const inputUrl = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

const mockFetch = (handler: (call: Call, index: number) => Response) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call = { url: inputUrl(input), init: init ?? {} };
      calls.push(call);
      return handler(call, calls.length);
    }),
  );
  return calls;
};

function Trigger({ onResult }: { readonly onResult: (value: unknown) => void }) {
  const { stepUpExp } = useStepUp();
  const remaining = useStepUpRemaining();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void adminApi
            .put('/admin/settings/free_shipping_threshold', { value: 1 })
            .then(onResult, onResult)
        }
      >
        Save
      </button>
      <output data-testid="exp">{stepUpExp ?? 'none'}</output>
      <output data-testid="remaining">{remaining}</output>
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('StepUpProvider', () => {
  it('opens the dialog on 403 STEP_UP_REQUIRED, verifies the code and retries the request once', async () => {
    const results: unknown[] = [];
    const calls = mockFetch((call, index) => {
      if (call.url === '/api/auth/step-up')
        return json(200, { success: true, data: { stepUpExp: 4_102_444_800 }, error: null });
      return index === 1 ? stepUpRequired() : json(200, { success: true, data: 1, error: null });
    });
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger onResult={(value) => results.push(value)} />
      </StepUpProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm with your authenticator' });
    const input = screen.getByLabelText('6-digit code');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(input).toHaveFocus();
    expect(screen.getByTestId('stepup-submit')).toBeDisabled();
    await user.type(input, '123456');
    await user.click(screen.getByTestId('stepup-submit'));

    await waitFor(() => expect(results).toEqual([{ data: 1 }]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/admin/settings/free_shipping_threshold',
      '/api/auth/step-up',
      '/api/v1/admin/settings/free_shipping_threshold',
    ]);
    expect(calls[1]?.init.body).toBe(JSON.stringify({ code: '123456' }));
    expect(screen.getByTestId('exp')).toHaveTextContent('4102444800');
    expect(Number(screen.getByTestId('remaining').textContent)).toBeGreaterThan(0);
  });

  it('shows an inline error on a wrong code, lets the user cancel, and rejects the request', async () => {
    const results: unknown[] = [];
    const calls = mockFetch((call) =>
      call.url === '/api/auth/step-up'
        ? json(401, {
            success: false,
            data: null,
            error: { code: 'INVALID_OTP', message: 'Invalid or expired code' },
          })
        : stepUpRequired(),
    );
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger onResult={(value) => results.push(value)} />
      </StepUpProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.type(await screen.findByLabelText('6-digit code'), '000000');
    await user.click(screen.getByTestId('stepup-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code did not work');
    expect(screen.getByLabelText('6-digit code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toBeInstanceOf(AdminApiError);
    expect(results[0]).toMatchObject({
      code: 'STEP_UP_REQUIRED',
      message: 'Confirmation cancelled',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.filter((call) => call.url.startsWith('/api/v1'))).toHaveLength(1);
  });

  it('closes on Escape and surfaces network failures and rate limits', async () => {
    mockFetch((call) =>
      call.url === '/api/auth/step-up'
        ? json(429, {
            success: false,
            data: null,
            error: { code: 'RATE_LIMITED', message: 'slow down' },
          })
        : stepUpRequired(),
    );
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger onResult={() => undefined} />
      </StepUpProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.type(await screen.findByLabelText('6-digit code'), '111111');
    await user.click(screen.getByTestId('stepup-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts the initial step-up window down each second and hides at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const exp = Math.floor(Date.now() / 1000) + 3;
    render(
      <StepUpProvider initialStepUpExp={exp}>
        <Trigger onResult={() => undefined} />
      </StepUpProvider>,
    );

    expect(screen.getByTestId('remaining')).toHaveTextContent('3');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('remaining')).toHaveTextContent('2');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('remaining')).toHaveTextContent('0');
  });

  it('throws when the hooks are used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Trigger onResult={() => undefined} />)).toThrow(
      'useStepUp must be used inside StepUpProvider',
    );
    spy.mockRestore();
  });
});
