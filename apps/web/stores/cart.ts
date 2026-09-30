'use client';

import { create } from 'zustand';

export interface CartItemDto {
  readonly variantId: string;
  readonly productSlug: string;
  readonly name: string;
  readonly variantLabel: string;
  readonly imageUrl: string | null;
  readonly unitPricePaise: number;
  readonly quantity: number;
  readonly lineTotalPaise: number;
  readonly availableQuantity: number;
  readonly flags: readonly ('removed' | 'unavailable' | 'reduced')[];
}

export interface FreeShipping {
  readonly thresholdPaise: number;
  readonly remainingPaise: number;
  readonly reached: boolean;
}

export interface CartDto {
  readonly items: readonly CartItemDto[];
  readonly subtotalPaise: number;
  readonly itemCount: number;
  readonly freeShipping: FreeShipping;
  readonly coupon: null;
  readonly notices: readonly string[];
}

export const EMPTY_CART: CartDto = {
  items: [],
  subtotalPaise: 0,
  itemCount: 0,
  freeShipping: { thresholdPaise: 0, remainingPaise: 0, reached: false },
  coupon: null,
  notices: [],
};

type CartStatus = 'idle' | 'loading' | 'error';

interface CartState {
  readonly cart: CartDto;
  readonly status: CartStatus;
  readonly errorMessage: string | null;
  readonly hydrated: boolean;
  readonly open: boolean;
  readonly hydrate: () => Promise<void>;
  readonly forceRefresh: () => Promise<void>;
  readonly add: (variantId: string, quantity: number) => Promise<void>;
  readonly update: (variantId: string, quantity: number) => Promise<void>;
  readonly remove: (variantId: string) => Promise<void>;
  readonly setOpen: (open: boolean) => void;
}

const BFF_BASE = '/api/cart-session';

const apiFetch = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<CartDto | null> => {
  const url = `${BFF_BASE}?path=${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const envelope = await response.json() as { success: boolean; data?: CartDto };
  return envelope.success && envelope.data ? envelope.data : null;
};

export const useCartStore = create<CartState>()((set, get) => ({
  cart: EMPTY_CART,
  status: 'idle',
  errorMessage: null,
  hydrated: false,
  open: false,

  hydrate: async () => {
    if (get().hydrated) return;
    set({ status: 'loading', errorMessage: null });
    try {
      let cart = await apiFetch('GET', '/cart');
      if (cart === null) {
        // H-16: null means !response.ok — treat as a fetch error, not an empty cart
        set({ cart: EMPTY_CART, status: 'error', errorMessage: 'Failed to load cart', hydrated: true });
        return;
      }
      const removedIds = cart.items
        .filter((item) => item.flags.includes('removed'))
        .map((item) => item.variantId);
      for (const id of removedIds) {
        const updated = await apiFetch('DELETE', `/cart/items/${id}`);
        if (updated) cart = updated;
      }
      set({ cart, status: 'idle', errorMessage: null, hydrated: true });
    } catch {
      set({ cart: EMPTY_CART, status: 'error', errorMessage: 'Failed to load cart', hydrated: true });
    }
  },

  forceRefresh: async () => {
    set({ hydrated: false });
    await get().hydrate();
  },

  add: async (variantId, quantity) => {
    const prev = get().cart;
    const optimistic: CartDto = {
      ...prev,
      itemCount: prev.itemCount + quantity,
    };
    set({ cart: optimistic, open: true, errorMessage: null });
    const updated = await apiFetch('POST', '/cart/items', { variantId, quantity });
    if (updated) {
      set({ cart: updated, status: 'idle', errorMessage: null });
    } else {
      set({ cart: prev, status: 'error', errorMessage: 'Failed to add item to cart' });
    }
  },

  update: async (variantId, quantity) => {
    const prev = get().cart;
    set({ errorMessage: null });
    const updated = await apiFetch('PUT', `/cart/items/${variantId}`, { quantity });
    if (updated) {
      set({ cart: updated, status: 'idle', errorMessage: null });
    } else {
      set({ cart: prev, status: 'error', errorMessage: 'Failed to update cart' });
    }
  },

  remove: async (variantId) => {
    const prev = get().cart;
    set({ errorMessage: null });
    const updated = await apiFetch('DELETE', `/cart/items/${variantId}`);
    if (updated) {
      set({ cart: updated, status: 'idle', errorMessage: null });
    } else {
      set({ cart: prev, status: 'error', errorMessage: 'Failed to remove item from cart' });
    }
  },

  setOpen: (open) => set({ open }),
}));

export const useCartCount = (): number => useCartStore((s) => s.cart.itemCount);
export const useCartOpen = (): boolean => useCartStore((s) => s.open);
export const useCartAdd = () => useCartStore((s) => s.add);
export const useCartUpdate = () => useCartStore((s) => s.update);
export const useCartRemove = () => useCartStore((s) => s.remove);
export const useSetCartOpen = () => useCartStore((s) => s.setOpen);
