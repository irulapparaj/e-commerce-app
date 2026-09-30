const KEY_PREFIX = 'checkout:idem:';
const CHECKOUT_KEY = `${KEY_PREFIX}current`;

const tryStorage = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

export const getOrCreateIdempotencyKey = (): string => {
  const store = tryStorage();
  if (store !== null) {
    const existing = store.getItem(CHECKOUT_KEY);
    if (existing !== null) return existing;
  }
  const key = crypto.randomUUID();
  try {
    store?.setItem(CHECKOUT_KEY, key);
  } catch {
    // storage full or blocked — use the in-memory key for this request
  }
  return key;
};

export const rotateIdempotencyKey = (): string => {
  const key = crypto.randomUUID();
  try {
    tryStorage()?.setItem(CHECKOUT_KEY, key);
  } catch {
    // ignore
  }
  return key;
};

export const clearIdempotencyKey = (): void => {
  try {
    tryStorage()?.removeItem(CHECKOUT_KEY);
  } catch {
    // ignore
  }
};
