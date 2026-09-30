import type { OrderStatus } from '@prisma/client';

/**
 * Statuses that can still be cancelled (before dispatch).
 * DISPATCHED and beyond cannot be cancelled.
 */
const CANCEL_ELIGIBLE: readonly OrderStatus[] = ['PENDING', 'CONFIRMED'];

/**
 * Allowed manual order status transitions for admin users.
 *
 * CONFIRMED → DISPATCHED is handled only by the ship service, not a manual status change.
 * Manual transitions allowed:
 *   DISPATCHED → IN_TRANSIT  (manual update with note)
 *   DISPATCHED → DELIVERED   (manual update with note)
 *   IN_TRANSIT → DELIVERED   (manual update with note)
 */
const ALLOWED_MANUAL_TRANSITIONS: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
};

/**
 * Returns true if the transition from `from` to `to` is allowed as a manual admin action.
 * Does NOT cover the CONFIRMED → DISPATCHED path (use ship service for that).
 */
export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => {
  const allowed = ALLOWED_MANUAL_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
};

/**
 * Returns true when the order is still eligible for cancellation (before it has been dispatched).
 */
export const cancelEligible = (status: OrderStatus): boolean =>
  (CANCEL_ELIGIBLE as readonly string[]).includes(status);

/** Statuses that represent a terminal or forward-only state (cannot regress to earlier). */
const STATUS_ORDER: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
];

/**
 * Returns true if `next` is a forward-only progression from `current`.
 * Used by the webhook to skip regressions and replays.
 */
export const isForwardTransition = (current: OrderStatus, next: OrderStatus): boolean => {
  const currentIdx = STATUS_ORDER.indexOf(current);
  const nextIdx = STATUS_ORDER.indexOf(next);
  if (currentIdx === -1 || nextIdx === -1) return false;
  return nextIdx > currentIdx;
};
