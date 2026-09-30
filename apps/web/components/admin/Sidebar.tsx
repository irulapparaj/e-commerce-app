'use client';

import { brand } from '@pe/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { canSee, isActivePath } from '@/lib/admin/rbac';

import { ADMIN_NAV, type AdminNavItem } from './Nav.config';

interface SidebarProps {
  readonly role: string;
}

interface NavEntryProps {
  readonly item: AdminNavItem;
  readonly active: boolean;
}

const abbreviation = (label: string): string =>
  label
    .split(/[\s/&]+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

function NavEntry({ item, active }: NavEntryProps) {
  const abbr = (
    <span className="admin-nav-abbr" aria-hidden="true">
      {abbreviation(item.label)}
    </span>
  );
  if (!item.available) {
    return (
      <span
        className="admin-nav-item admin-nav-item-disabled"
        aria-disabled="true"
        title={`${item.label} — coming soon`}
        data-testid={`nav-item-${item.key}`}
      >
        {abbr}
        <span className="admin-nav-label">{item.label}</span>
        <span className="admin-nav-soon">soon</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={active ? 'admin-nav-item admin-nav-item-active' : 'admin-nav-item'}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-item-${item.key}`}
    >
      {abbr}
      <span className="admin-nav-label">{item.label}</span>
    </Link>
  );
}

/** Role-aware navigation generated from Nav.config.ts (DESIGN §8.1); hiding is UX, not enforcement. */
export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const items = ADMIN_NAV.filter((item) => canSee(item, role));

  return (
    <aside
      className={collapsed ? 'admin-sidebar admin-sidebar-collapsed' : 'admin-sidebar'}
      data-testid="admin-sidebar"
    >
      <div className="admin-sidebar-top">
        <Link href="/admin" className="admin-wordmark" aria-label={`${brand.name} admin home`}>
          <span className="admin-nav-abbr" aria-hidden="true">
            {brand.name.charAt(0)}
          </span>
          <span className="admin-nav-label">{brand.name}</span>
        </Link>
        <button
          type="button"
          className="admin-btn admin-btn-icon"
          aria-expanded={!collapsed}
          aria-controls="admin-nav"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={() => setCollapsed((current) => !current)}
          data-testid="sidebar-toggle"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav id="admin-nav" aria-label="Admin navigation" data-testid="admin-nav">
        <ul className="admin-nav-list">
          {items.map((item) => (
            <li key={item.key}>
              <NavEntry item={item} active={isActivePath(pathname, item.href)} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
