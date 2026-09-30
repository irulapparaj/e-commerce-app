// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MaskedValue } from './MaskedValue';

describe('MaskedValue', () => {
  it('masks all but the first two and last three characters until revealed, then hides again', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn(async () => '9876543210');
    render(<MaskedValue value="9876543210" label="phone number" onReveal={onReveal} />);

    expect(screen.getByTestId('masked-value')).toHaveTextContent('98•••••210');
    await user.click(screen.getByRole('button', { name: 'Reveal phone number' }));

    expect(screen.getByTestId('masked-value')).toHaveTextContent('9876543210');
    expect(onReveal).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Hide phone number' }));
    expect(screen.getByTestId('masked-value')).toHaveTextContent('98•••••210');
  });

  it('shows an error and stays masked when the reveal fails', async () => {
    const user = userEvent.setup();
    render(
      <MaskedValue
        value="T Nagar, Chennai"
        label="address"
        keepStart={0}
        keepEnd={7}
        onReveal={() => Promise.reject(new Error('step-up cancelled'))}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reveal address' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reveal this value.');
    expect(screen.getByTestId('masked-value')).toHaveTextContent('•••••••••Chennai');
  });
});
