// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminShell } from './AdminShell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));

describe('AdminShell', () => {
  it('composes the sidebar, top bar, providers and main region around the page', () => {
    render(
      <AdminShell
        nonce="abc"
        environment="test"
        user={{ email: 'staff@example.test', role: 'STAFF', mfaEnabled: true }}
        stepUpExp={null}
      >
        <h1 id="page-title">Dashboard</h1>
      </AdminShell>,
    );

    expect(screen.getByRole('main', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();
    expect(screen.getByTestId('env-badge')).toHaveTextContent('test');
    expect(screen.queryByTestId('nav-item-settings')).toBeNull();
    expect(screen.getByTestId('toast-region')).toBeInTheDocument();
    expect(screen.getByTestId('admin-sidebar').parentElement).toHaveAttribute(
      'data-has-nonce',
      'true',
    );
  });
});
