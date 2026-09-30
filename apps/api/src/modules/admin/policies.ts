import type { Role } from '@prisma/client';

import type { Guard, Guards } from '../auth/guards';

export interface AdminPolicy {
  readonly roles: readonly Extract<Role, 'ADMIN' | 'STAFF'>[];
  /** ⚡ in DESIGN §8.1: a fresh TOTP within the last five minutes. */
  readonly stepUp: boolean;
}

const BOTH = ['ADMIN', 'STAFF'] as const;
const ADMIN = ['ADMIN'] as const;

/**
 * The §8.1 role matrix as data. Routes build their guards from it and the RBAC integration test
 * iterates it, so the two cannot drift (P05 review note).
 */
export const ADMIN_POLICIES = {
  'settings.read': { roles: BOTH, stepUp: false },
  'settings.write': { roles: ADMIN, stepUp: true },
  'staff.read': { roles: ADMIN, stepUp: false },
  'staff.write': { roles: ADMIN, stepUp: true },
  'audit.read': { roles: ADMIN, stepUp: false },
  'security.read': { roles: ADMIN, stepUp: false },
  'security.write': { roles: ADMIN, stepUp: true },
  'stats.read': { roles: BOTH, stepUp: false },
  'products.read': { roles: BOTH, stepUp: false },
  'products.content': { roles: BOTH, stepUp: false },
  'products.commercial': { roles: ADMIN, stepUp: true },
  'variants.content': { roles: BOTH, stepUp: false },
  'variants.price': { roles: ADMIN, stepUp: true },
  'images.write': { roles: BOTH, stepUp: false },
  'jobs.read': { roles: BOTH, stepUp: false },
  'categories.read': { roles: BOTH, stepUp: false },
  'categories.write': { roles: ADMIN, stepUp: false },
  'inventory.read': { roles: BOTH, stepUp: false },
  'inventory.adjust': { roles: BOTH, stepUp: false },
  'inventory.adjust_large': { roles: ADMIN, stepUp: true },
  'inventory.ledger_check': { roles: ADMIN, stepUp: true },
  'imports.read': { roles: BOTH, stepUp: false },
  'imports.write': { roles: ADMIN, stepUp: false },
  'imports.apply': { roles: ADMIN, stepUp: true },
  'exports.products': { roles: BOTH, stepUp: false },
  'exports.sensitive': { roles: ADMIN, stepUp: true },
  'exports.read': { roles: BOTH, stepUp: false },
  'customers.read': { roles: BOTH, stepUp: false },
  'customers.reveal': { roles: ADMIN, stepUp: true },
  /** The reveal token (5 min, bound to actor + customer) is the proof; no second step-up. */
  'customers.pii': { roles: ADMIN, stepUp: false },
  'customers.disable': { roles: ADMIN, stepUp: true },
  'customers.enable': { roles: ADMIN, stepUp: false },
  'customers.sessions_revoke': { roles: ADMIN, stepUp: true },
  'customers.dpdp_export': { roles: ADMIN, stepUp: false },
  'customers.erase': { roles: ADMIN, stepUp: true },
  'email.suppress': { roles: ADMIN, stepUp: true },
  'orders.read': { roles: BOTH, stepUp: false },
  'orders.ship': { roles: BOTH, stepUp: false },
  'orders.notes': { roles: BOTH, stepUp: false },
  'orders.status': { roles: BOTH, stepUp: false },
  'orders.tracking': { roles: BOTH, stepUp: false },
  'orders.cancel': { roles: ADMIN, stepUp: true },
  'orders.refund': { roles: ADMIN, stepUp: true },
  'orders.address_edit': { roles: ADMIN, stepUp: true },
} as const satisfies Record<string, AdminPolicy>;

export type AdminPolicyName = keyof typeof ADMIN_POLICIES;

/** Guard chain: admin audience → MFA enrolled → role → (step-up). Order fixes the error code seen first. */
export const policyGuards = (guards: Guards, name: AdminPolicyName): Guard[] => {
  const policy: AdminPolicy = ADMIN_POLICIES[name];
  return [
    guards.authenticate('admin'),
    guards.requireMfaEnrolled(),
    guards.requireRole(...policy.roles),
    ...(policy.stepUp ? [guards.requireStepUp()] : []),
  ];
};
