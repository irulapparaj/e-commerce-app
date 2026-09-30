export type AdminRole = 'ADMIN' | 'STAFF';

export interface AdminNavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** Roles with any access to the page (a "View" cell in DESIGN §8.1 counts). */
  readonly roles: readonly AdminRole[];
  /** The §8.1 "Step-up" column, one phrase per entry. */
  readonly stepUpActions?: readonly string[];
  /** False until the plan that builds the page lands; rendered as a disabled "soon" entry. */
  readonly available: boolean;
}

const BOTH: readonly AdminRole[] = ['ADMIN', 'STAFF'];
const ADMIN_ONLY: readonly AdminRole[] = ['ADMIN'];

/** DESIGN.md §8.1, all sixteen rows in table order. Reviewers compare this file to the table. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard', roles: BOTH, available: true },
  {
    key: 'orders',
    href: '/admin/orders',
    label: 'Orders',
    roles: BOTH,
    stepUpActions: ['Cancel', 'refund', 'address edit'],
    available: true,
  },
  {
    key: 'returns',
    href: '/admin/returns',
    label: 'Returns & Refunds',
    roles: BOTH,
    stepUpActions: ['Refund', 'deduction'],
    available: false,
  },
  {
    key: 'products',
    href: '/admin/products',
    label: 'Products',
    roles: BOTH,
    stepUpActions: ['Price change', 'publish'],
    available: true,
  },
  {
    key: 'inventory',
    href: '/admin/inventory',
    label: 'Inventory',
    roles: BOTH,
    stepUpActions: ['Adjustment > 100 units'],
    available: true,
  },
  {
    key: 'categories',
    href: '/admin/categories',
    label: 'Categories',
    roles: BOTH,
    available: true,
  },
  {
    key: 'import',
    href: '/admin/import',
    label: 'Import / Export',
    roles: BOTH,
    stepUpActions: ['Import apply', 'orders/customers export'],
    available: true,
  },
  {
    key: 'customers',
    href: '/admin/customers',
    label: 'Customers',
    roles: BOTH,
    stepUpActions: ['Reveal PII', 'disable', 'role change', 'erasure'],
    available: true,
  },
  {
    key: 'coupons',
    href: '/admin/coupons',
    label: 'Coupons & Promotions',
    roles: BOTH,
    stepUpActions: ['Create/edit coupon'],
    available: false,
  },
  { key: 'reviews', href: '/admin/reviews', label: 'Reviews', roles: BOTH, available: false },
  { key: 'blog', href: '/admin/blogs', label: 'Blog', roles: BOTH, available: false },
  {
    key: 'shipping',
    href: '/admin/shipping',
    label: 'Shipping',
    roles: BOTH,
    stepUpActions: ['Threshold change'],
    available: false,
  },
  {
    key: 'settings',
    href: '/admin/settings',
    label: 'Settings',
    roles: ADMIN_ONLY,
    stepUpActions: ['All'],
    available: true,
  },
  {
    key: 'staff',
    href: '/admin/staff',
    label: 'Staff & Roles',
    roles: ADMIN_ONLY,
    stepUpActions: ['All'],
    available: true,
  },
  { key: 'audit', href: '/admin/audit', label: 'Audit Log', roles: ADMIN_ONLY, available: true },
  {
    key: 'security',
    href: '/admin/security',
    label: 'Security & Health',
    roles: ADMIN_ONLY,
    available: true,
  },
];
