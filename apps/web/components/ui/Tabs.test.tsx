// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from './Tabs';

const Example = ({ onValueChange }: { readonly onValueChange?: (value: string) => void }) => (
  <Tabs defaultValue="one" {...(onValueChange === undefined ? {} : { onValueChange })}>
    <Tabs.List label="Details">
      <Tabs.Tab value="one">One</Tabs.Tab>
      <Tabs.Tab value="two">Two</Tabs.Tab>
      <Tabs.Tab value="three">Three</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="one">Panel one</Tabs.Panel>
    <Tabs.Panel value="two">Panel two</Tabs.Panel>
    <Tabs.Panel value="three">Panel three</Tabs.Panel>
  </Tabs>
);

describe('Tabs', () => {
  it('wires tablist, tabs and panels with roving tabindex', () => {
    render(<Example />);
    const one = screen.getByRole('tab', { name: 'One' });

    expect(screen.getByRole('tablist', { name: 'Details' })).toBeInTheDocument();
    expect(one).toHaveAttribute('aria-selected', 'true');
    expect(one).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel one');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', one.id);
  });

  it('selects on click and moves with arrows, Home and End (automatic activation)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: string) => void>();
    render(<Example onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel three');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
    await user.keyboard('{Tab}');

    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([
      'two',
      'three',
      'one',
      'three',
      'one',
      'three',
    ]);
  });

  it('can be controlled and throws when parts are used outside Tabs', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <Tabs defaultValue="one" value="two">
        <Tabs.List label="L">
          <Tabs.Tab value="one">One</Tabs.Tab>
          <Tabs.Tab value="two">Two</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="one">P1</Tabs.Panel>
        <Tabs.Panel value="two">P2</Tabs.Panel>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('P2');
    expect(() => rerender(<Tabs.Tab value="x">x</Tabs.Tab>)).toThrow(
      'Tabs.* must be used inside <Tabs>',
    );
    expect(() => render(<Tabs.Panel value="x">x</Tabs.Panel>)).toThrow();
  });
});
