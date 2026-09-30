// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { CUSTOMER_ID, customerDetail, pii } from '@/test-utils/customers';

import { CANCELLED_MESSAGE, EXPIRED_MESSAGE, RevealDialog } from './RevealDialog';

const TTL_MS = 8_000;
const REASON = 'Support ticket 1234: verify contact';

const grant = () => ({
  revealToken: 'reveal.jwt',
  expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
});

const headersOfCall = (index: number): Record<string, string> => {
  const init = (globalThis.fetch as unknown as Mock).mock.calls[index]?.[1] as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
};

/**
 * Only the countdown's interval and the clock are faked: `setTimeout`/`setImmediate` stay real so
 * user-event, Testing Library's `findBy*` and the stubbed `Response.json()` keep working.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RevealDialog', () => {
  const setup = () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RevealDialog customer={customerDetail} open onClose={onClose} />);
    return { user, onClose };
  };

  it('requires a ten-character reason, reveals through the token header and re-masks at zero', async () => {
    const calls = stubFetch((call) =>
      call.url.endsWith('/reveal') ? okEnvelope(grant()) : okEnvelope(pii),
    );
    const { user } = setup();
    const submit = screen.getByTestId('reveal-submit');

    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId('reveal-reason'), 'too short');
    expect(submit).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('slightly longer');
    await user.clear(screen.getByTestId('reveal-reason'));
    await user.type(screen.getByTestId('reveal-reason'), REASON);
    expect(submit).toBeEnabled();

    await user.click(submit);

    expect(await screen.findByTestId('customer-pii-email')).toHaveTextContent('irul@example.test');
    expect(screen.getByTestId('customer-pii-phone')).toHaveTextContent('9876543210');
    expect(screen.getByTestId('customer-pii-name')).toHaveTextContent('Irul Rajan');
    expect(screen.getByTestId('customer-pii-address')).toHaveTextContent('12 Temple Street');
    expect(screen.getByTestId('reveal-countdown')).toHaveTextContent('00:08');
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/customers/${CUSTOMER_ID}/reveal`,
        method: 'POST',
        body: { reason: REASON },
      },
      { url: `/api/v1/admin/customers/${CUSTOMER_ID}/pii`, method: 'GET', body: undefined },
    ]);
    expect(headersOfCall(1)['X-Reveal-Token']).toBe('reveal.jwt');

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('reveal-countdown')).toHaveTextContent('00:05');

    await act(async () => {
      vi.advanceTimersByTime(TTL_MS);
    });
    expect(screen.queryByTestId('customer-pii-email')).toBeNull();
    expect(screen.queryByTestId('reveal-countdown')).toBeNull();
    expect(screen.getByTestId('reveal-notice')).toHaveTextContent(EXPIRED_MESSAGE);
    // A second reveal starts from a blank reason: the token is gone and the audit log wants a new one.
    expect(screen.getByTestId('reveal-reason')).toHaveValue('');
    expect(screen.getByTestId('reveal-submit')).toBeDisabled();
    expect(calls).toHaveLength(2);
  });

  it('explains a cancelled step-up and an expired token, and resets on close', async () => {
    stubFetch((call, index) =>
      index === 1
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : call.url.endsWith('/reveal')
          ? okEnvelope(grant())
          : errorEnvelope(401, 'REVEAL_EXPIRED', 'Reveal token expired'),
    );
    const { user, onClose } = setup();

    await user.type(screen.getByTestId('reveal-reason'), REASON);
    await user.click(screen.getByTestId('reveal-submit'));
    expect(await screen.findByTestId('reveal-error')).toHaveTextContent(CANCELLED_MESSAGE);

    await user.click(screen.getByTestId('reveal-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('reveal-error')).toHaveTextContent(EXPIRED_MESSAGE),
    );
    expect(screen.queryByTestId('customer-pii-email')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('surfaces other API messages such as the daily reveal limit', async () => {
    stubFetch(() => errorEnvelope(429, 'RATE_LIMITED', 'Reveal limit reached for today'));
    const { user } = setup();

    await user.type(screen.getByTestId('reveal-reason'), REASON);
    await user.click(screen.getByTestId('reveal-submit'));

    expect(await screen.findByTestId('reveal-error')).toHaveTextContent(
      'Reveal limit reached for today',
    );
  });
});
