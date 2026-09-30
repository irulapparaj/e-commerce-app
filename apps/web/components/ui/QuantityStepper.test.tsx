// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { clampQuantity, QuantityStepper } from './QuantityStepper';

const setup = (value: number, props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) => {
  const onChange = vi.fn<(next: number) => void>();
  const view = renderWithIntl(<QuantityStepper value={value} onChange={onChange} {...props} />);
  return { onChange, view };
};

describe('clampQuantity', () => {
  it.each([
    [0, 1],
    [1, 1],
    [7.9, 7],
    [20, 20],
    [21, 20],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('clamps %s to %i within 1–20', (input, expected) => {
    expect(clampQuantity(input, 1, 20)).toBe(expected);
  });
});

describe('QuantityStepper', () => {
  it('is a labelled spinbutton with min, max and current value', () => {
    setup(3);

    const input = screen.getByRole('spinbutton', { name: 'Quantity' });
    expect(input).toHaveAttribute('aria-valuemin', '1');
    expect(input).toHaveAttribute('aria-valuemax', '20');
    expect(input).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('group', { name: 'Quantity' })).toBeInTheDocument();
  });

  it('steps with the buttons and disables them at the bounds', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(1);

    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).toHaveBeenCalledWith(2);

    setup(20);
    expect(screen.getAllByRole('button', { name: 'Increase quantity' })[1]).toBeDisabled();
  });

  it('steps with ArrowUp/ArrowDown and jumps with Home/End, clamping to the range', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(20);
    const input = screen.getByRole('spinbutton');

    input.focus();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}');
    await user.keyboard('{End}');

    expect(onChange.mock.calls).toEqual([[20], [19], [1], [20]]);
  });

  it('commits a typed value on blur and on Enter, clamping and ignoring junk', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(2);
    const input = screen.getByRole('spinbutton');

    await user.clear(input);
    await user.type(input, '99');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(20);

    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(input).toHaveValue('2');
  });

  it('disables everything when disabled and honours a custom label and range', () => {
    setup(5, { disabled: true, label: 'Packs', min: 2, max: 6 });

    expect(screen.getByRole('spinbutton', { name: 'Packs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuemax', '6');
  });
});
