import type Redis from 'ioredis';

import type { LoginEvent } from '../auth/hooks';

import type { CartItemRow } from './schemas';
import { cartKey, deleteCart, getCart, setCart, USER_CART_TTL_SECONDS } from './store';

const MAX_QUANTITY = 20;

/** Merge guest items into user items: sum quantities, cap at 20, user coupon wins. */
const mergeItems = (
  userItems: readonly CartItemRow[],
  guestItems: readonly CartItemRow[],
): CartItemRow[] => {
  const map = new Map<string, number>(userItems.map((item) => [item.variantId, item.quantity]));
  for (const item of guestItems) {
    const existing = map.get(item.variantId) ?? 0;
    map.set(item.variantId, Math.min(MAX_QUANTITY, existing + item.quantity));
  }
  return Array.from(map.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
};

/**
 * Merge the guest cart into the user cart when a user logs in (P11).
 * Idempotent: a second call is a no-op because the guest key is already deleted.
 */
export const mergeCartsOnLogin = async (valkey: Redis, event: LoginEvent): Promise<void> => {
  if (event.previousSessionId === null) return;

  const guestKey = cartKey(event.previousSessionId);
  const userKey = cartKey(event.userId);

  const [guestCart, userCart] = await Promise.all([
    getCart(valkey, guestKey),
    getCart(valkey, userKey),
  ]);

  if (guestCart === null) return; // Already merged or guest had no cart

  const mergedItems = mergeItems(userCart?.items ?? [], guestCart.items);

  const merged = {
    items: mergedItems,
    couponCode: userCart?.couponCode ?? guestCart.couponCode,
    updatedAt: new Date().toISOString(),
  };

  // User cart: 90-day TTL, refreshed on every read/write (BL-11)
  await setCart(valkey, userKey, merged, USER_CART_TTL_SECONDS);
  await deleteCart(valkey, guestKey);
};
