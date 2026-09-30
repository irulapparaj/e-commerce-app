import { ADMIN_NAV, type AdminNavItem, type AdminRole } from '@/components/admin/Nav.config';

const ADMIN_ROOT = '/admin';

export const isAdminRole = (role: string | undefined | null): role is AdminRole =>
  role === 'ADMIN' || role === 'STAFF';

/** UI visibility only: the API remains the enforcement point (DESIGN §11.3). */
export const canSee = (item: AdminNavItem, role: string | undefined | null): boolean =>
  isAdminRole(role) && item.roles.includes(role);

const matchesHref = (pathname: string, href: string): boolean =>
  href === ADMIN_ROOT
    ? pathname === ADMIN_ROOT
    : pathname === href || pathname.startsWith(`${href}/`);

/** The nav item owning a path by longest href prefix; `/admin` only matches itself. */
export const navItemForPath = (pathname: string): AdminNavItem | null =>
  ADMIN_NAV.filter((item) => matchesHref(pathname, item.href)).reduce<AdminNavItem | null>(
    (best, item) => (best === null || item.href.length > best.href.length ? item : best),
    null,
  );

/** The least-privileged role that may open a path, or null when no nav item owns it. */
export const requiredRoleForPath = (pathname: string): AdminRole | null => {
  const item = navItemForPath(pathname);
  if (item === null) return null;
  return item.roles.includes('STAFF') ? 'STAFF' : 'ADMIN';
};

export const isActivePath = (pathname: string, href: string): boolean =>
  navItemForPath(pathname)?.href === href;
