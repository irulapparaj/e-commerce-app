// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';
import { NotPermitted } from './NotPermitted';
import { PageHeader } from './PageHeader';
import { StatTile } from './StatTile';

describe('PageHeader', () => {
  it('renders the h1 with optional description and actions', () => {
    render(
      <PageHeader
        title="Staff"
        description="People"
        actions={<button type="button">Invite</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('is a status region with title, description and action', () => {
    render(<EmptyState title="Nothing" description="Yet" action={<a href="/x">go</a>} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing');
    expect(screen.getByRole('link', { name: 'go' })).toBeInTheDocument();
  });
});

describe('NotPermitted', () => {
  it('names the role and links back to the dashboard', () => {
    render(<NotPermitted role="STAFF" />);

    expect(screen.getByTestId('not-permitted')).toHaveTextContent(
      'Your role (STAFF) cannot open this page.',
    );
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('falls back to a generic message without a role', () => {
    render(<NotPermitted />);

    expect(screen.getByRole('alert')).toHaveTextContent('Your account cannot open this page.');
  });
});

describe('StatTile', () => {
  it('renders a plain tile or a linked one', () => {
    render(
      <ul>
        <StatTile label="Orders today" value="12" hint="0 until P12" testId="plain" />
        <StatTile
          label="Low stock"
          value="3"
          href="/admin/inventory?belowThreshold=true"
          tone="warning"
        />
      </ul>,
    );

    expect(screen.getByTestId('plain')).toHaveTextContent('Orders today');
    expect(screen.getByTestId('plain')).toHaveTextContent('0 until P12');
    expect(screen.getByRole('link', { name: /Low stock/ })).toHaveAttribute(
      'href',
      '/admin/inventory?belowThreshold=true',
    );
    expect(screen.getByRole('link', { name: /Low stock/ }).closest('li')).toHaveClass(
      'admin-stat-warning',
    );
  });
});
