// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Button, buttonClassName, ButtonLink, IconButton } from './Button';

describe('Button', () => {
  it('defaults to type=button, the primary variant and forwards clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithIntl(<Button onClick={onClick}>Add to cart</Button>);
    const button = screen.getByRole('button', { name: 'Add to cart' });

    await user.click(button);

    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('bg-accent', 'min-h-touch');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('maps every variant, size and fullWidth to classes', () => {
    expect(buttonClassName({ variant: 'secondary' })).toContain('border-text');
    expect(buttonClassName({ variant: 'ghost', size: 'sm' })).toContain('min-h-9');
    expect(buttonClassName({ variant: 'link' })).toContain('underline');
    expect(buttonClassName({ variant: 'link' })).not.toContain('min-h-touch');
    expect(buttonClassName({ fullWidth: true })).toContain('w-full');
  });

  it('disables itself and announces busy while loading, swapping the icon for a spinner', () => {
    const { rerender } = renderWithIntl(
      <Button icon="arrow" iconPosition="end" loading>
        Continue
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Continue' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    expect(button.querySelector('[data-icon]')).toBeNull();

    rerender(
      <Button icon="arrow" iconPosition="end">
        Continue
      </Button>,
    );
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button.querySelector('[data-icon="arrow"]')).not.toBeNull();
  });

  it('places a leading icon before the label', () => {
    renderWithIntl(<Button icon="bag">Cart</Button>);
    const button = screen.getByRole('button', { name: 'Cart' });
    expect(button.firstElementChild).toHaveAttribute('data-icon', 'bag');
  });
});

describe('ButtonLink', () => {
  it('renders an anchor with button styling and an optional icon', () => {
    renderWithIntl(
      <ButtonLink href="/" variant="secondary" icon="arrow">
        Back to home
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Back to home' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('border-text');
    expect(link.querySelector('[data-icon="arrow"]')).not.toBeNull();
  });
});

describe('IconButton', () => {
  it('is a 44 px square with an accessible name and optional attached badge', () => {
    renderWithIntl(
      <IconButton icon="bag" label="Cart, 2 items" active>
        <span data-testid="badge">2</span>
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Cart, 2 items' });
    expect(button).toHaveClass('size-touch', 'bg-surface');
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('supports the small size', () => {
    renderWithIntl(<IconButton icon="close" label="Close" size="sm" />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('size-9');
  });
});
