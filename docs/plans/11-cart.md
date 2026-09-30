# P11 — Cart (Valkey, drawer, merge on login)

|                  |                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                         |
| Estimated effort | 3 dev-days                                                                                                                                   |
| Depends on       | P03 (sessions, `onLogin` hook), P10 (Add to Cart surfaces)                                                                                   |
| Unblocks         | P12                                                                                                                                          |
| Design refs      | DESIGN.md §3 WF-03, §7 Cart (Valkey), §9 Cart & shipping, §11.3 (session regeneration, cart merge), §16 (free-shipping bar is an accent use) |
| Branch           | `feat/p11-cart`                                                                                                                              |

## 1. Goal

A server-priced cart in Valkey for guests and users, merged at login, exposed through the cart API, and surfaced as the slide-out drawer, header count and cart page. Every total the customer sees comes from the server; the client only holds a mirror for instant feedback.

## 2. Scope

### In

- API `modules/cart`: Valkey storage (`cart:{sid}` / `cart:{userId}`), guest cart session cookie issued by the BFF, `GET /cart` (priced), `POST /cart/items`, `PUT /cart/items/:variantId`, `DELETE /cart/items/:variantId`, `POST/DELETE /cart/coupon` (stub until P23), merge on `onLogin`, TTLs, line validation against live catalogue (inactive/out-of-stock/reduced-quantity flags), free-shipping progress from settings
- Web: real Zustand store (mirror + optimistic updates with rollback), `CartDrawer` (opens on add), `CartPage`, header count, `BuyNow` → `/checkout`, empty states, "reduced/unavailable" line notices

### Out

- Checkout (P12), coupons engine (P23), stock reservation (happens at order creation in P12, not in the cart)

## 3. Deliverables

```
apps/api/src/modules/cart/{routes.ts, store.ts, pricing.ts, merge.ts, session.ts, schemas.ts}
apps/web/app/api/cart-session/route.ts        # BFF: issues __Host-cart httpOnly cookie for guests
apps/web/stores/cart.ts                       # replaces the P10 placeholder, same public API
apps/web/components/cart/{CartDrawer, CartLine, CartSummary, FreeShippingBar, CartPage, EmptyCart}.tsx
apps/web/app/[locale]/cart/page.tsx
apps/api/test/int/cart/*.test.ts  apps/web/components/cart/*.test.tsx  apps/web/stores/cart.test.ts  tests/e2e/cart.spec.ts
```

## 4. Tasks (ordered)

1. **Session.** Guests: the BFF sets `__Host-cart` (httpOnly, Secure, SameSite=Lax, Path=/, 7 d, random 32 bytes) on first cart mutation and forwards it to the API as header `X-Cart-Session` (the API is still cookie-free). Users: cart key is `cart:{userId}` from the Bearer; the API ignores `X-Cart-Session` when authenticated (merge happens at login only).
2. **Storage.** `store.ts`: JSON `{ items: [{ variantId, quantity }], couponCode?: string, updatedAt }`; guest TTL 7 d refreshed on write; user carts no TTL; `WATCH`/Lua for atomic item updates (two concurrent adds must not lose one).
3. **Pricing.** `pricing.ts`: load variants + products in one query; drop lines whose variant no longer exists (flag `removed`), flag `unavailable` when product inactive or stock 0 (line kept with quantity 0 for messaging), clamp quantity to available stock with flag `reduced`, clamp to 20; compute `lineTotal`, `subtotal`, `itemCount`, `freeShipping: { thresholdPaise, remainingPaise, reached }` from `SiteSetting.free_shipping_threshold`; return `CartDto` with product name/image/variant label/price snapshot for display (never persisted).
4. **Routes** per DESIGN §9: `GET /cart` (priced), `POST /cart/items { variantId, quantity 1–20 }` (adds or increments up to 20), `PUT /cart/items/:variantId { quantity }` (0 removes), `DELETE`, `POST /cart/coupon { code }` → 400 `COUPONS_NOT_AVAILABLE` until P23 (keep the route so the UI contract is stable), `DELETE /cart/coupon`. Rate limit 120/min/session. All responses return the full priced `CartDto`.
5. **Merge (WF-05 step 6).** `merge.ts` subscribes to `hooks.onLogin({ userId, previousSessionId })`: sum quantities per variant (cap 20), keep the user cart's coupon, write `cart:{userId}`, delete `cart:{sid}`; idempotent. The BFF clears `__Host-cart` after login (P03's verify route calls a small hook).
6. **Web store.** `stores/cart.ts`: state `{ cart: CartDto | null, status }`; `hydrate()` on shell mount (`GET /cart`); `add/update/remove` apply an optimistic mirror update then call the BFF and replace with the server `CartDto`; on error rollback + toast; single in-flight queue per variant to avoid races; `useCartCount()` from `itemCount`.
7. **UI.** `CartDrawer` (ui/Drawer): lines with image, name, variant, `QuantityStepper`, remove; notices for `reduced`/`unavailable`; `FreeShippingBar` (accent fill; text "Add ₹X more for free shipping" / "You've unlocked free shipping"); `CartSummary` (subtotal, "Shipping & taxes calculated at checkout", primary "Continue to Checkout" → `/checkout`, secondary "View cart"); opens automatically after add; `CartPage` same content in page layout; `EmptyCart` with category links. `BuyNow` on PDP now routes to `/checkout` after add.
8. **E2E** `cart.spec.ts`: guest adds from collection card and from PDP (variant), drawer opens with correct totals, adjusts quantity, removes, reloads (persists via cookie), free-shipping bar crosses the threshold, then logs in → cart merged (server count = sum), `__Host-cart` cookie gone.

## 5. Contracts

- `CartDto { items: CartLineDto[], subtotalPaise, itemCount, freeShipping: { thresholdPaise, remainingPaise, reached }, coupon: null, notices: ('reduced'|'unavailable'|'removed')[] }`; `CartLineDto { variantId, productSlug, name, variantLabel, imageUrl, unitPricePaise, quantity, lineTotalPaise, availableQuantity, flags[] }`.
- Header `X-Cart-Session` only from the BFF; the API rejects it on authenticated requests silently (ignored).
- `hooks.onLogin` consumed exactly once per login; merge is idempotent.

## 6. Test plan

### Unit

- `pricing.ts`: clamping to stock and to 20, flags, free-shipping remaining/reached at boundary (subtotal == threshold), subtotal arithmetic in paise.
- `merge.ts`: sums with cap, coupon precedence, empty guest/user cases, idempotent second call.
- Store reducers: optimistic add/update/remove produce new objects (immutability test with `Object.isFrozen` on fixtures), rollback restores exact prior state, in-flight queue serialises updates per variant.

### Integration (Valkey + Postgres, seeded)

- Guest: add → `GET /cart` priced from DB; qty 21 → clamped 20 with flag; unknown variant → 404; inactive product → `unavailable` with qty 0; stock 3 and qty 5 → `reduced` to 3.
- Two concurrent `POST /cart/items` for different variants → both present (atomicity).
- TTL: guest key has ≈ 7 d TTL after write; user key has none.
- Merge on login: guest {A:2, B:1} + user {A:19, C:1} → {A:20, B:1, C:1}; guest key deleted; second `onLogin` no-op.
- Authenticated request with `X-Cart-Session` header → uses user cart, ignores header.
- Coupon stub returns `COUPONS_NOT_AVAILABLE`.
- Rate limit 121st mutation/min → 429.

### Web

- `CartDrawer` a11y (focus trap, Escape) and notices rendering; `FreeShippingBar` copy at three states.

### E2E

- `cart.spec.ts` (task 8).

### Security

- Cart session cookie attributes; header not accepted from browsers directly (BFF-only — test by calling the API with the header and no BFF → still works, since the API cannot know; the real control is that the API never reads cookies. Document.)
- No price fields accepted from the client (schemas `.strict()`).

### Coverage targets

- `modules/cart/**`: 95 %; `stores/cart.ts`, `components/cart/**`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] All cart totals server-computed; the client mirror never invents numbers (test: tamper the store, server response wins)
- [ ] Merge on login proven end to end; guest cookie cleared
- [ ] Reduced/unavailable notices shown when catalogue changes under the cart (E2E step: admin unpublishes a product in the cart)
- [ ] Coupon route exists with the stub error so P23 needs no UI contract change

## 8. Senior engineer review notes

- The cart does **not** reserve stock; reservation is a checkout concern (P12). Clamping in the cart is display guidance, not a hold.
- Atomic updates in Valkey matter more than they look: "add to cart" double-clicks and drawer stepper spam are the common case.
- Price snapshots in `CartDto` are for display; never persist them — the order transaction re-prices from the DB (R9/R10).
- Keep `X-Cart-Session` a header from the BFF, not a cookie read by the API — the API stays cookie-free as decided in R1.
- The optimistic mirror must be replaced by the server DTO on every response; do not merge client and server states, it creates ghost lines.
- The free-shipping bar is one of the three sanctioned accent uses (§16); use it, but keep the copy quiet.

## 9. Implementation prompt

```
You are implementing plan P11 from docs/plans/11-cart.md. Read DESIGN.md §3 WF-03 and WF-05 step 6, §7 Cart, §9 Cart & shipping, §11.3 session regeneration/cart merge, and docs/plans/00-README.md (R1, R9, R10). P03 and P10 are merged: use hooks.onLogin, the BFF, rate limits, the catalogue queries and the P09/P10 components (QuantityStepper, Drawer, Price, Toast) and replace the placeholder Zustand cart store keeping its public API.

Deliver: the cart API module with Valkey storage (atomic item updates, 7-day guest TTL, no TTL for users), server-side pricing with reduced/unavailable/removed flags and free-shipping progress from settings, routes GET/POST/PUT/DELETE /cart(/items/:variantId) and the coupon stub returning COUPONS_NOT_AVAILABLE, merge-on-login subscribed to hooks.onLogin (sum with cap 20, user coupon wins, guest key deleted, idempotent), the BFF cart-session cookie (__Host-cart httpOnly) forwarded as X-Cart-Session and cleared at login, the Zustand store with optimistic updates + rollback + per-variant in-flight queue, CartDrawer (auto-opens on add), CartLine, CartSummary, FreeShippingBar, CartPage, EmptyCart, and BuyNow now routing to /checkout.

Work test-first from P11 §6: pricing and merge unit tests, store immutability/rollback tests, integration tests for clamping/flags/atomic concurrent adds/TTLs/merge/header-ignored-when-authenticated/rate limit against real Valkey + Postgres, drawer a11y tests, and the cart Playwright spec including the login-merge step and an admin-unpublish step showing the unavailable notice.

Constraints: no client-supplied prices (strict schemas), no stock reservation in the cart, API never reads cookies, server DTO always replaces the client mirror, immutable data, files ≤ 400 lines, strings via next-intl.

When done: run all suites and the E2E on compose, complete the P11 Definition of Done with evidence, and stop for review.
```
