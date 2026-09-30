# P23 — Coupons & promotions

|                  |                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                                                                                                |
| Estimated effort | 4 dev-days                                                                                                                                                |
| Depends on       | P19 · P11 (coupon stub), P12 (order transaction, cancel hook), P05 (settings: promo popup, announcement)                                                  |
| Unblocks         | P26 (scheduled promotions)                                                                                                                                |
| Design refs      | DESIGN.md §3 WF-08, §7 Coupon, §8.1 Coupons & Promotions row, §9 Cart (`/cart/coupon`), §11.2/§11.3 (Stock, coupons, pricing), §16 (popup off by default) |
| Branch           | `feat/p23-coupons`                                                                                                                                        |

## 1. Goal

A coupon engine that is validated at preview, redeemed atomically inside the order transaction, released on cancellation, and correct for GST (discount reduces the taxable amount pro-rata); an admin to manage codes; BOGO promotions applied without a code; and the promo popup wired to settings, off by default.

## 2. Scope

### In

- Engine: `PERCENTAGE`, `FIXED`, `FREE_SHIPPING`, `BUY_X_GET_Y` (BOGO as promotion rules with optional code); rules: active window, `minOrderValue`, `maxUses`, `perUserLimit`, `stackable=false`; case-insensitive codes `^[A-Z0-9]{4,20}$`
- `POST /cart/coupon` real validation (replaces stub); `POST /orders` redeems atomically (`UPDATE … SET used_count = used_count + 1 WHERE used_count < max_uses`), per-user count from orders; release on `onOrderCancelled` (timeout/cancel) decrements
- Pricing: discount distributed pro-rata across lines _before_ `splitGst`; free-shipping coupon zeroes shipping; totals never negative
- Admin `/admin/coupons` (ADMIN ⚡ create/edit/deactivate; usage stats), `/admin/promotions` (BOGO rules, promo popup config, announcement bar — settings from P05)
- Storefront: coupon field at checkout with clear errors; discount line in summary/order emails; `PromoPopup` (settings-driven, once per session via `sessionStorage`, minimalist, off by default)

### Out

- Category/product-restricted coupons, referral codes, scheduled campaigns beyond the window fields (P26)

## 3. Deliverables

```
apps/api/src/modules/coupons/{engine.ts, validate.ts, redeem.ts, release.ts, routes.admin.ts, schemas.ts}
apps/api/src/modules/promotions/{bogo.ts, routes.admin.ts}
apps/api/src/modules/orders/pricing.ts (+ discount distribution)  apps/api/src/modules/cart/routes.ts (coupon real)
apps/web/components/checkout/CouponField.tsx (real)  apps/web/components/marketing/PromoPopup.tsx
apps/web/app/admin/{coupons/page.tsx, promotions/page.tsx}
apps/api/test/{unit,int}/coupons/*.test.ts  tests/e2e/coupons.spec.ts
```

## 4. Tasks (ordered)

1. `engine.ts` (pure): `evaluate(cart, coupon, ctx) → { ok, discountPaise, freeShipping, reason? }`; BOGO computes free units for the `getVariant` given `buyVariant` quantities.
2. `validate.ts`: lookup by upper-cased code; window, active, min order, global and per-user usage (per-user from `Order.couponCode` count for non-cancelled orders); returns preview breakdown; `POST /cart/coupon` stores the code on the cart; errors `COUPON_INVALID | COUPON_EXPIRED | COUPON_MIN_ORDER | COUPON_LIMIT_REACHED | COUPON_USER_LIMIT`.
3. Pricing: distribute `discountPaise` pro-rata by line subtotal with paisa remainder to the largest line; then `splitGst` per line on the discounted amount; assert `Σ discounts == discountPaise`.
4. `redeem.ts` inside the P12 transaction: conditional increment; if 0 rows → 409 `COUPON_LIMIT_REACHED` and rollback; `release.ts` on cancel hook decrements once (idempotent per order).
5. BOGO: promotion rules table (`Promotion { id, type:'BOGO', buyVariantId, getVariantId, buyQty, getQty, window, active }`), auto-applied at cart pricing when the buy quantity is met (adds a ₹0-priced free line flagged `promo`); stock for free units reserved like any line.
6. Admin pages and routes with RBAC (§8.1: view STAFF, edit ADMIN ⚡) and usage stats; promo popup + announcement configuration UI (settings keys from P05).
7. `PromoPopup`: reads `settings/public.promoPopup`; off unless enabled; shows once per session; product card + Add to Cart; dismiss; no auto-open under reduced motion? (Still shows, without animation.)
8. E2E and emails: discount line in order-confirmation template (P13 update).

## 5. Contracts

- Order stores `couponCode`, `discountAmount`; DTOs show a `discount` line; tax fields reflect discounted taxable values.
- `Promotion` model (new migration) as in task 5.
- Redeem/release are idempotent per order id.

## 6. Test plan

- **Unit:** engine per type incl. boundaries (min order exactly met, 100 % percentage capped at subtotal, fixed > subtotal → subtotal), BOGO unit math, pro-rata distribution property (sum equal, non-negative lines), `splitGst` after discount property (`Σ tax` consistent).
- **Integration:** preview errors table; 20 concurrent orders with `maxUses=10` → exactly 10 succeed; per-user limit; cancellation releases exactly once; BOGO auto-applies and reserves free units; free-shipping coupon zeroes shipping; admin RBAC; popup settings roundtrip.
- **E2E:** apply a percentage code at checkout → totals and tax update → order email shows the discount; expired code error; popup appears once per session when enabled and never when disabled.
- **Security:** codes normalised; no client-supplied discount amounts; enumeration of codes rate-limited (10/min/session on preview).
- **Coverage:** modules 95 %.

## 7. Definition of Done

- [ ] Atomic redemption under concurrency proven; release on cancel proven
- [ ] GST computed on discounted amounts with pro-rata distribution tested
- [ ] BOGO works without a code; popup off by default and once per session
- [ ] Admin RBAC per §8.1

## 8. Senior engineer review notes

- Discount before tax is a legal correctness point in India (GST is on the consideration actually charged); test it explicitly.
- The conditional `UPDATE … WHERE used_count < max_uses` is the entire concurrency story; do not read-then-write.
- Keep coupons whole-cart in this version; per-category rules multiply the distribution edge cases.
- The popup is a business ask the design deliberately mutes; ship it off by default and keep it quiet.

## 9. Implementation prompt

```
You are implementing plan P23 from docs/plans/23-coupons-promotions.md. Read DESIGN.md §3 WF-08, §7 Coupon, §8.1 Coupons & Promotions, §9 /cart/coupon, §11.3 stock/coupons and §16 (popup). P11, P12, P05 and P19 are merged.

Deliver: the pure coupon engine (PERCENTAGE, FIXED, FREE_SHIPPING, BUY_X_GET_Y), validation with the error codes in P23 §4.2 replacing the cart stub, pro-rata discount distribution applied before splitGst in order pricing, atomic conditional redemption inside the order transaction and idempotent release on the cancel hook, a Promotion model with BOGO auto-apply at cart pricing (free units reserved), admin coupons/promotions pages and routes with §8.1 RBAC and step-up, the settings-driven PromoPopup (off by default, once per session), and the discount line in order emails.

Work test-first from P23 §6 (engine boundaries and properties, concurrency on maxUses, release idempotency, BOGO, free shipping, RBAC), then the coupons Playwright spec.

Constraints: no client-supplied discount amounts, conditional UPDATE for redemption, whole-cart coupons only, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P23 Definition of Done with evidence, and stop for review.
```
