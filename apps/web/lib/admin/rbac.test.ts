import { describe, expect, it } from 'vitest';

import { ADMIN_NAV, type AdminRole } from '@/components/admin/Nav.config';

import { canSee, isActivePath, isAdminRole, navItemForPath, requiredRoleForPath } from './rbac';

const ROLES: readonly AdminRole[] = ['ADMIN', 'STAFF'];
const ADMIN_ONLY_KEYS = ['settings', 'staff', 'audit', 'security'] as const;

describe('ADMIN_NAV matches DESIGN §8.1', () => {
  it('has the sixteen rows in table order with unique keys and hrefs', () => {
    expect(ADMIN_NAV.map((item) => item.label)).toEqual([
      'Dashboard',
      'Orders',
      'Returns & Refunds',
      'Products',
      'Inventory',
      'Categories',
      'Import / Export',
      'Customers',
      'Coupons & Promotions',
      'Reviews',
      'Blog',
      'Shipping',
      'Settings',
      'Staff & Roles',
      'Audit Log',
      'Security & Health',
    ]);
    expect(new Set(ADMIN_NAV.map((item) => item.key)).size).toBe(ADMIN_NAV.length);
    expect(new Set(ADMIN_NAV.map((item) => item.href)).size).toBe(ADMIN_NAV.length);
  });

  it('gives STAFF no access to exactly the four ADMIN-only rows', () => {
    const adminOnly = ADMIN_NAV.filter((item) => !item.roles.includes('STAFF')).map((i) => i.key);

    expect(adminOnly).toEqual([...ADMIN_ONLY_KEYS]);
    expect(ADMIN_NAV.every((item) => item.roles.includes('ADMIN'))).toBe(true);
  });

  it('records the step-up column phrases', () => {
    const byKey = new Map(ADMIN_NAV.map((item) => [item.key, item.stepUpActions]));

    expect(byKey.get('orders')).toEqual(['Cancel', 'refund', 'address edit']);
    expect(byKey.get('inventory')).toEqual(['Adjustment > 100 units']);
    expect(byKey.get('settings')).toEqual(['All']);
    expect(byKey.get('audit')).toBeUndefined();
  });
});

describe('canSee', () => {
  // Generated from the config so the nav and this matrix cannot drift apart.
  it.each(
    ADMIN_NAV.flatMap((item) =>
      ROLES.map((role) => ({ item, role, expected: item.roles.includes(role) })),
    ),
  )('$role sees "$item.label": $expected', ({ item, role, expected }) => {
    expect(canSee(item, role)).toBe(expected);
  });

  it('hides everything from customers, anonymous visitors and unknown roles', () => {
    for (const item of ADMIN_NAV) {
      expect(canSee(item, 'CUSTOMER')).toBe(false);
      expect(canSee(item, undefined)).toBe(false);
      expect(canSee(item, null)).toBe(false);
    }
  });

  it('STAFF cannot see the four ADMIN-only items', () => {
    const visible = ADMIN_NAV.filter((item) => canSee(item, 'STAFF')).map((item) => item.key);

    expect(visible).toHaveLength(ADMIN_NAV.length - ADMIN_ONLY_KEYS.length);
    for (const key of ADMIN_ONLY_KEYS) expect(visible).not.toContain(key);
  });
});

describe('isAdminRole', () => {
  it('accepts only ADMIN and STAFF', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('STAFF')).toBe(true);
    expect(isAdminRole('CUSTOMER')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe('requiredRoleForPath', () => {
  it('derives the least privileged role from the nav by longest prefix', () => {
    expect(requiredRoleForPath('/admin')).toBe('STAFF');
    expect(requiredRoleForPath('/admin/products/abc')).toBe('STAFF');
    expect(requiredRoleForPath('/admin/settings')).toBe('ADMIN');
    expect(requiredRoleForPath('/admin/staff/123')).toBe('ADMIN');
  });

  it('only matches /admin exactly and returns null for unknown paths', () => {
    expect(requiredRoleForPath('/admin/unknown')).toBeNull();
    expect(requiredRoleForPath('/admin/login')).toBeNull();
    expect(requiredRoleForPath('/administration')).toBeNull();
    expect(navItemForPath('/admin/')).toBeNull();
  });
});

describe('isActivePath', () => {
  it('marks the owning item active and nothing else', () => {
    expect(isActivePath('/admin', '/admin')).toBe(true);
    expect(isActivePath('/admin/audit', '/admin')).toBe(false);
    expect(isActivePath('/admin/products/1', '/admin/products')).toBe(true);
    expect(isActivePath('/admin/productsx', '/admin/products')).toBe(false);
  });
});
