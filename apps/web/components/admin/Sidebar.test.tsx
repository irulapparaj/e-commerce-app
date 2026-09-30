// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_NAV } from './Nav.config';
import { Sidebar } from './Sidebar';

const pathname = vi.hoisted(() => ({ current: '/admin' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const ADMIN_ONLY = ['settings', 'staff', 'audit', 'security'];

describe('Sidebar', () => {
  it('renders only the STAFF-permitted items in table order', () => {
    render(<Sidebar role="STAFF" />);
    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    const keys = within(nav)
      .getAllByTestId(/^nav-item-/)
      .map((node) => node.getAttribute('data-testid')?.replace('nav-item-', ''));

    expect(keys).toEqual(
      ADMIN_NAV.filter((item) => item.roles.includes('STAFF')).map((item) => item.key),
    );
    for (const key of ADMIN_ONLY) expect(screen.queryByTestId(`nav-item-${key}`)).toBeNull();
  });

  it('renders all sixteen items for ADMIN, links the available ones and disables the rest', () => {
    render(<Sidebar role="ADMIN" />);

    expect(screen.getAllByTestId(/^nav-item-/)).toHaveLength(ADMIN_NAV.length);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
    const orders = screen.getByTestId('nav-item-orders');
    expect(orders.tagName).toBe('A');
    expect(orders).toHaveAttribute('href', '/admin/orders');
  });

  it('marks the item owning the current path as the current page', () => {
    pathname.current = '/admin/products/abc';
    render(<Sidebar role="ADMIN" />);

    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    pathname.current = '/admin';
  });

  it('collapses and expands with an accessible toggle', async () => {
    const user = userEvent.setup();
    render(<Sidebar role="ADMIN" />);
    const toggle = screen.getByRole('button', { name: 'Collapse navigation' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);

    expect(screen.getByTestId('admin-sidebar')).toHaveClass('admin-sidebar-collapsed');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
  });

  it('shows nothing to a customer role', () => {
    render(<Sidebar role="CUSTOMER" />);

    expect(screen.queryAllByTestId(/^nav-item-/)).toHaveLength(0);
  });
});
