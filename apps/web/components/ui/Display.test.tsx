// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Badge } from './Badge';
import { cx } from './cx';
import { Icon, ICON_NAMES, IconSprite } from './Icon';
import { ExternalLink, Link } from './Link';
import { Container, Grid, Rule, Section, Stack } from './Primitives';
import { Skeleton } from './Skeleton';
import { VisuallyHidden } from './VisuallyHidden';

describe('cx', () => {
  it('joins truthy strings only', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});

describe('Badge', () => {
  it('is small-caps text with a semantic tone', () => {
    render(
      <>
        <Badge>New</Badge>
        <Badge tone="critical">Sold out</Badge>
      </>,
    );
    expect(screen.getByText('New')).toHaveClass('small-caps', 'text-text');
    expect(screen.getByText('Sold out')).toHaveClass('text-critical');
  });
});

describe('Icon', () => {
  it('references the sprite, is decorative by default and named when labelled', () => {
    render(
      <>
        <IconSprite />
        <Icon name="search" />
        <Icon name="chevron" label="Open" direction="up" size={16} />
      </>,
    );
    const sprite = screen.getByTestId('icon-sprite');
    expect(sprite.querySelectorAll('symbol')).toHaveLength(ICON_NAMES.length);
    expect(sprite.querySelector('#icon-bag')).not.toBeNull();

    const decorative = document.querySelector('[data-icon="search"]');
    expect(decorative).toHaveAttribute('aria-hidden', 'true');
    expect(decorative?.querySelector('use')).toHaveAttribute('href', '#icon-search');

    const named = screen.getByRole('img', { name: 'Open' });
    expect(named).toHaveClass('rotate-180');
    expect(named).toHaveAttribute('width', '16');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech and repeats lines with a shorter last line', () => {
    render(
      <>
        <Skeleton variant="image" />
        <Skeleton variant="text" lines={3} />
      </>,
    );
    const [image, lines] = screen.getAllByTestId('skeleton');
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveClass('aspect-product');
    expect(lines?.children).toHaveLength(3);
    expect(lines?.children[2]).toHaveClass('w-2/3');
  });
});

describe('VisuallyHidden', () => {
  it('renders sr-only text in the requested element', () => {
    render(<VisuallyHidden as="p">hidden</VisuallyHidden>);
    expect(screen.getByText('hidden').tagName).toBe('P');
    expect(screen.getByText('hidden')).toHaveClass('sr-only');
  });
});

describe('Link', () => {
  it('renders locale-aware internal links and safe external links', () => {
    renderWithIntl(
      <>
        <Link href="/collections/dhoop" variant="nav">
          Dhoop
        </Link>
        <Link href="/pages/contact" variant="quiet">
          Contact
        </Link>
        <ExternalLink href="https://www.instagram.com/">Instagram</ExternalLink>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Dhoop' })).toHaveAttribute(
      'href',
      '/collections/dhoop',
    );
    expect(screen.getByRole('link', { name: 'Dhoop' })).toHaveClass('min-h-touch');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveClass('text-muted');
    const external = screen.getByRole('link', { name: 'Instagram' });
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(external).toHaveAttribute('target', '_blank');
  });
});

describe('Primitives', () => {
  it('render the content column, section rhythm, twelve-column grid, stacks and hairlines', () => {
    render(
      <Container as="section" size="narrow" aria-label="c">
        <Section space="tight" aria-label="s">
          <Grid as="ul" gap="tight">
            <li>cell</li>
          </Grid>
          <Stack direction="row" gap={3} align="center" wrap as="nav">
            <span>a</span>
          </Stack>
          <Rule space="section" />
        </Section>
      </Container>,
    );
    expect(screen.getByLabelText('c')).toHaveClass('max-w-3xl', 'px-gutter');
    expect(screen.getByLabelText('s')).toHaveClass('py-8');
    expect(screen.getByRole('list')).toHaveClass('grid-cols-layout', 'gap-2');
    expect(screen.getByRole('navigation')).toHaveClass(
      'flex-row',
      'gap-6',
      'items-center',
      'flex-wrap',
    );
    expect(screen.getByRole('separator')).toHaveClass('my-section');
  });
});
