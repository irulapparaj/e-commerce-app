import type Redis from 'ioredis';

import { CartStorage } from './schemas';

export const GUEST_TTL_SECONDS = 604_800; // 7 days
export const USER_CART_TTL_SECONDS = 7_776_000; // 90 days

export const cartKey = (sessionId: string): string => `cart:${sessionId}`;

/** Read the raw cart document from Valkey.  Returns null if missing or unparseable.
 *  When ttlSeconds is provided, the key's expiry is refreshed on every hit. */
export const getCart = async (
  valkey: Redis,
  key: string,
  ttlSeconds?: number,
): Promise<CartStorage | null> => {
  const raw = await valkey.get(key);
  if (raw === null) return null;
  try {
    const parsed = CartStorage.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await valkey.expire(key, ttlSeconds);
    }
    return parsed.data;
  } catch {
    return null;
  }
};

/** Write the cart document to Valkey with an optional TTL. */
export const setCart = async (
  valkey: Redis,
  key: string,
  cart: CartStorage,
  ttlSeconds?: number,
): Promise<void> => {
  const encoded = JSON.stringify(cart);
  if (ttlSeconds !== undefined && ttlSeconds > 0) {
    await valkey.set(key, encoded, 'EX', ttlSeconds);
  } else {
    await valkey.set(key, encoded);
  }
};

/** Remove a cart document from Valkey. */
export const deleteCart = async (valkey: Redis, key: string): Promise<void> => {
  await valkey.del(key);
};

// Lua: atomically get-or-create cart, upsert the item (sum quantities, cap at 20), write back.
// KEYS[1] = cart key
// ARGV[1] = variantId
// ARGV[2] = quantity delta (integer string)
// ARGV[3] = ISO timestamp string for updatedAt
// ARGV[4] = TTL in seconds ("0" = no expire)
const ATOMIC_ADD_LUA = `
local raw = redis.call('GET', KEYS[1])
local cart
if raw == false then
  cart = {items = {}, updatedAt = ARGV[3]}
else
  cart = cjson.decode(raw)
end
local variantId = ARGV[1]
local qty = tonumber(ARGV[2])
local items = cart.items or {}
local result = {}
local found = false
for i = 1, #items do
  local item = items[i]
  if item.variantId == variantId then
    result[#result + 1] = {variantId = item.variantId, quantity = math.min(20, item.quantity + qty)}
    found = true
  else
    result[#result + 1] = item
  end
end
if not found then
  result[#result + 1] = {variantId = variantId, quantity = math.min(20, qty)}
end
cart.items = result
cart.updatedAt = ARGV[3]
local encoded = cjson.encode(cart)
redis.call('SET', KEYS[1], encoded)
local ttl = tonumber(ARGV[4])
if ttl and ttl > 0 then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return encoded
`;

/**
 * Atomically add or increment a cart item via a Lua eval.
 * Concurrent requests are serialised by Redis's single-threaded Lua executor.
 */
export const atomicAddItem = async (
  valkey: Redis,
  key: string,
  variantId: string,
  quantity: number,
  ttlSeconds?: number,
): Promise<CartStorage> => {
  const encoded = (await valkey.eval(
    ATOMIC_ADD_LUA,
    1,
    key,
    variantId,
    String(quantity),
    new Date().toISOString(),
    String(ttlSeconds ?? 0),
  )) as string;
  const parsed = CartStorage.safeParse(JSON.parse(encoded));
  if (!parsed.success) {
    throw new Error(`cart: atomicAddItem returned invalid data: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
};
