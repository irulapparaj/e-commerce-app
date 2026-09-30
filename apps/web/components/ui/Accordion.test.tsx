// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Accordion } from './Accordion';

const Example = ({ type }: { readonly type: 'single' | 'multiple' }) => (
  <Accordion type={type} defaultOpen={['a']} headingLevel={2}>
    <Accordion.Item id="a" title="Shipping">
      Dispatched from Chennai.
    </Accordion.Item>
    <Accordion.Item id="b" title="Returns">
      Fifteen days.
    </Accordion.Item>
  </Accordion>
);

describe('Accordion', () => {
  it('renders heading buttons that control labelled regions', () => {
    render(<Example type="single" />);
    const shipping = screen.getByRole('button', { name: 'Shipping' });

    expect(shipping.closest('h2')).not.toBeNull();
    expect(shipping).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Shipping' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Returns' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('region', { name: 'Returns' })).toBeNull();
  });

  it('single mode closes the others; multiple keeps them open; both toggle closed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Example type="single" />);

    await user.click(screen.getByRole('button', { name: 'Returns' }));
    expect(screen.getByRole('button', { name: 'Shipping' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Returns' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Returns' }));
    expect(screen.getByRole('button', { name: 'Returns' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(<Example type="multiple" />);
    await user.click(screen.getByRole('button', { name: 'Shipping' }));
    await user.click(screen.getByRole('button', { name: 'Returns' }));
    expect(screen.getByRole('button', { name: 'Shipping' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Returns' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('throws when an item is rendered outside an Accordion', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <Accordion.Item id="x" title="x">
          x
        </Accordion.Item>,
      ),
    ).toThrow();
  });
});
