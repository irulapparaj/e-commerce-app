# P12 — Checkout, orders, GST, Razorpay

|                  |                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                                      |
| Estimated effort | 7 dev-days                                                                                                                                                                |
| Depends on       | P11 (cart), P13 (email templates)                                                                                                                                         |
| Unblocks         | P14, P15                                                                                                                                                                  |
| Design refs      | DESIGN.md §3 WF-04, §7 (Order, OrderItem, OrderStatusEvent, WebhookEvent), §9 Orders/payment + Webhooks, §10 (Payments, GST), §11.3 (Payments), R4, R7, R9, R10, R11, R17 |
| Branch           | `feat/p12-checkout`                                                                                                                                                       |

## 1. Goal

A customer with a cart and a session can enter an address, see server-computed totals with the correct CGST+SGST/IGST split from Chennai, pay through Razorpay hosted Checkout, and land on a confirmation page — with stock reserved atomically, orders idempotent under retries, the webhook as the payment authority, abandoned orders released after 30 minutes, and confirmation email sent.

## 2. Scope

### In

- API: address CRUD (scoped), serviceability endpoint via `ShippingPort`, `POST /orders` (idempotent, transactional, reserves stock, tax split, Razorpay order), `POST /orders/:id/verify-payment`, `GET /orders`, `GET /orders/:id`, Razorpay webhook (`payment.captured`, `payment.failed`, `refund.processed` generic handling), `order-release` job + sweeper, Razorpay client (orders, payments fetch, refunds — refunds used by P14/P22), test-only payment stub (R4)
- Web: `/checkout` (contact, address select/add with PIN check, shipping method, coupon stub, summary, pay), Razorpay Checkout.js integration (CSP allow-listed), retry/failed states, `/checkout/success/[orderId]`
- Emails: order confirmation via P13

### Out

- Admin order management, shipment creation, cancel/refund routes (P14), returns (P22), coupons (P23), partial pay/invoice PDF (P26), reconciliation (P25)

## 3. Deliverables

```
apps/api/src/modules/addresses/{routes.ts, schemas.ts}
apps/api/src/modules/shipping/{serviceability.routes.ts, serviceability.service.ts}
apps/api/src/modules/tax/{order-tax.ts}                       # per-line split via packages/shared splitGst
apps/api/src/modules/orders/{routes.ts, create.service.ts, pricing.ts, idempotency.ts, status.ts, dto.ts, release.job.ts}
apps/api/src/modules/payments/{razorpay.client.ts, verify.service.ts, webhook.routes.ts, webhook.handlers.ts, signature.ts, test-stub.routes.ts}
apps/web/app/[locale]/checkout/{page.tsx, success/[orderId]/page.tsx}
apps/web/components/checkout/{CheckoutSteps, ContactCard, AddressPicker, AddressForm, ShippingMethod, CouponField, OrderSummary, PayButton, RazorpayLoader, PaymentFailed}.tsx
apps/web/lib/checkout/{idempotency.ts, razorpay.ts}
tests/fixtures/razorpay/{payment.captured.json, payment.failed.json, refund.processed.json, order.json, payment.json}
apps/api/test/int/{orders,payments,addresses}/*.test.ts  apps/api/test/security/payments/*.test.ts  tests/e2e/checkout.spec.ts
```

## 4. Tasks (ordered)

1. **Addresses.** `GET/POST /account/addresses`, `PUT/DELETE /account/addresses/:id`, `POST …/:id/default` — all `forUser(userId)`; schema: name, phone (`^[6-9]\d{9}$`), line1 (≤ 120), line2?, city, `state` from the shared states enum, pincode; max 10 addresses; first becomes default.
2. **Serviceability.** `GET /shipping/serviceability?pincode=&weightGrams=` → `ShippingPort.checkServiceability` from the Chennai pickup (settings); cached in Valkey `svc:{pincode}:{weightBand}` 24 h; returns `{ serviceable, etaDays, ratePaise, courier }`. Rate limit 30/min/session.
3. **Order pricing.** `pricing.ts` (pure): input priced cart lines (from P11 pricing, re-run inside the transaction), address state, settings (threshold, flat/quoted shipping) → per line `splitGst(unitPrice × qty, gstRate, destinationState)`; sums `subtotal`, `cgst/sgst/igst`, `shippingAmount` (0 if subtotal ≥ threshold else quoted rate), `discountAmount` (0 until P23), `total = subtotal + shipping − discount` (prices are GST-inclusive; tax is informational and must sum to the split of `subtotal`). Property: `cgst+sgst+igst == Σ line tax`; exactly one pair non-zero (DB check constraint).
4. **Idempotency (R10).** `idempotency.ts`: `Idempotency-Key` header required (UUID); Valkey `idem:{userId}:{key}` → `SET NX` `{ state:'IN_PROGRESS' }` TTL 60 s; on success store `{ state:'DONE', status, body }` TTL 24 h; concurrent duplicate → 409 `IDEMPOTENCY_IN_PROGRESS`; replay → stored response; on failure delete the key (client may retry).
5. **Create order.** `create.service.ts`: (a) load user cart (must be non-empty, no `unavailable` lines) and address (scoped); (b) serviceability must be `serviceable`; (c) pre-compute pricing; (d) create Razorpay order `{ amount: total, currency:'INR', receipt: <uuid>, notes: { userId } }` via `razorpay.client`; (e) transaction: re-price and assert equality with (c) (else 409 `PRICE_CHANGED`), `nextOrderNumber`, insert `Order` (status `PENDING`, `paymentStatus PENDING`, `razorpayOrderId`, `destinationState`, address snapshot with encrypted lines, `email/phone` from user), `OrderItem` snapshots (name, label, sku, unitPrice, qty, hsn, gstRate), `OrderStatusEvent PENDING SYSTEM`, `applyMovement(ORDER_RESERVE, −qty)` per line (any failure → 409 `INSUFFICIENT_STOCK { variantId, available }` and full rollback); (f) schedule `order-release` job `startAfter: 30 min` with the order id; (g) clear the cart; (h) return `{ orderId, orderNumber, razorpayOrderId, amountPaise, keyId, summary }`. Orphaned Razorpay orders from step (e) failures are harmless and logged.
6. **Verify payment.** `POST /orders/:id/verify-payment { razorpay_order_id, razorpay_payment_id, razorpay_signature }` (scoped): `signature.ts` HMAC-SHA256(`${order_id}|${payment_id}`, `RAZORPAY_KEY_SECRET`) compared with `timingSafeEqual`; `razorpay_order_id` must equal the order's; then **fetch the payment** from Razorpay and assert `status ∈ {captured, authorized→capture}` and `amount == total`; transition via `status.ts` `markPaid(orderId, paymentId)` — idempotent on `razorpayPaymentId` (unique) — sets `paymentStatus PAID`, `status CONFIRMED`, event, enqueues `email.order-confirmation`. Bad signature → 401 `PAYMENT_SIGNATURE_INVALID` + security counter.
7. **Webhook.** `POST /webhooks/razorpay` raw body; verify `X-Razorpay-Signature` with `RAZORPAY_WEBHOOK_SECRET` (timing-safe); insert `WebhookEvent { provider: RAZORPAY, externalId: event.id }` (unique → replay returns 200 without processing); handlers: `payment.captured` → `markPaid` (authority; works even if verify-payment never came), `payment.failed` → append `OrderStatusEvent` note `payment_failed`, order stays `PENDING` (retry allowed until release), `refund.processed` → `paymentStatus REFUNDED|PARTIALLY_REFUNDED` by amount (P14/P22 use). Always 200 after storing; processing errors logged and retried via job.
8. **Release.** `release.job.ts`: if order `PENDING` and `paymentStatus != PAID` → `CANCELLED`, `applyMovement(ORDER_RELEASE, +qty)` per item, event `SYSTEM cancelled: payment timeout`, coupon release hook (no-op until P23), email `order-cancelled`; if paid → no-op. Sweeper cron every 10 min catches missed jobs.
9. **Read.** `GET /orders` (scoped, paginated, summary DTO), `GET /orders/:id` (scoped: items, totals with tax split, address snapshot decrypted, timeline, tracking placeholder). Non-owner → 404 (not 403).
10. **Test stub (R4).** `test-stub.routes.ts`: `POST /__test__/payments/simulate { orderId, outcome:'captured'|'failed' }` builds a Razorpay-shaped event from fixtures, signs it with the test webhook secret and posts it to the webhook route in-process. Registered only when `NODE_ENV === 'test'`; boot assertion throws if the route file is imported otherwise.
11. **Web checkout.** Middleware already gates `/checkout` (P03). Page (client + server data): `ContactCard` (email, phone editable → saved to profile), `AddressPicker` (saved addresses, add via `AddressForm` with live serviceability on PIN blur showing ETA/rate or "not serviceable"), `ShippingMethod` (standard with ETA; free when threshold reached), `CouponField` (calls stub, shows "Coupons coming soon" on `COUPONS_NOT_AVAILABLE`), `OrderSummary` (lines, subtotal, shipping, "Includes CGST ₹x + SGST ₹y" or "Includes IGST ₹z", total), `PayButton` → `POST /orders` with a per-attempt `Idempotency-Key` (`lib/checkout/idempotency.ts` stores it in `sessionStorage`, reused on network retry, rotated after success/`PRICE_CHANGED`) → `RazorpayLoader` loads `https://checkout.razorpay.com/v1/checkout.js` (script allowed by the storefront CSP) → open with `{ key, amount, order_id, prefill, theme.color: accent }` → `handler` posts to verify → `router.push('/checkout/success/{orderId}')`; `modal.ondismiss`/failure → `PaymentFailed` with "Try again" (same `razorpayOrderId`, reopens checkout) and a note that the order is held for 30 minutes.
12. **Success page.** Server component, session-scoped `GET /orders/:id`; if not owner → 404; shows number, items, totals, tax split, address, "We'll email you when it ships"; clears any checkout idempotency key.
13. **E2E** `checkout.spec.ts`: login → add two products → checkout → add address (TN pincode → CGST+SGST shown) → pay: the test intercepts the Razorpay script (route stub) and calls the payment stub with `captured` → success page with order number; a second run with a Maharashtra pincode shows IGST; failed outcome → PaymentFailed → retry → captured; release: create order, advance the job (test hook to run `order-release` now) → order `CANCELLED`, stock restored.

## 5. Contracts

- `POST /orders` headers `Idempotency-Key: <uuid>`; body `{ addressId, shippingMethod: 'standard', couponCode?: string }`; 201 `{ orderId, orderNumber, razorpayOrderId, amountPaise, keyId, summary: OrderSummaryDto }`; 409 `INSUFFICIENT_STOCK | PRICE_CHANGED | IDEMPOTENCY_IN_PROGRESS | CART_EMPTY | PIN_NOT_SERVICEABLE`.
- `POST /orders/:id/verify-payment` 200 `{ status:'CONFIRMED' }`; 401 `PAYMENT_SIGNATURE_INVALID`; 409 `PAYMENT_AMOUNT_MISMATCH`.
- `OrderDetailDto { id, orderNumber, status, paymentStatus, items[], subtotalPaise, shippingPaise, discountPaise, tax: { cgst, sgst, igst }, totalPaise, address, timeline[], tracking: null, createdAt }`.
- Webhook: raw body required (Fastify `rawBody`), 401 on bad signature, 200 on replay.
- `hooks.onOrderPaid(order)` and `hooks.onOrderCancelled(order)` for P13/P14/P23 subscribers.

## 6. Test plan

### Unit

- `pricing.ts`: mixed-rate cart (5 % camphor + 18 % candle) to TN → CGST/SGST per line sums; to `MH` → IGST; free shipping at threshold boundary; property test (fast-check): Σ line tax == order tax, exactly one pair non-zero, totals non-negative.
- `signature.ts`: known vector from Razorpay docs; timing-safe wrapper; wrong length rejected without throwing.
- `idempotency.ts` state machine; `status.ts` transition table (PENDING→CONFIRMED ok; CONFIRMED→CONFIRMED idempotent; CANCELLED→CONFIRMED rejected).
- Webhook parsers against fixtures (event id, payment id, amount, order id extraction).

### Integration (Postgres + Valkey; Razorpay HTTP mocked with msw)

- Create: happy path → order + items + reservation + release job scheduled + cart cleared + Razorpay order called once with the server amount.
- Stock 3, cart 5 → 409 with `available`, no order row, no Razorpay call? (Razorpay is called before the transaction: assert it was called once and the order is absent — accepted orphan.)
- Same key twice → same order id; concurrent same key → one 201 + one 409; different key → second order.
- `PRICE_CHANGED`: change price between pre-compute and transaction (hook) → 409, rollback.
- Verify: valid signature + mocked payment fetch (captured, amount ok) → CONFIRMED/PAID, event, email job enqueued; amount mismatch → 409; bad signature → 401 + counter; replay → 200 idempotent; other user's order → 404.
- Webhook: valid `payment.captured` on a PENDING order → PAID even without verify-payment; invalid signature → 401 and no `WebhookEvent`; duplicate `event.id` → 200 no-op; `payment.failed` leaves PENDING with a note.
- Release: PENDING order → job → CANCELLED, stock back (ledger `ORDER_RELEASE`), email job; PAID order → no-op; sweeper picks an order whose job was deleted.
- Addresses: CRUD scoped (IDOR → 404), max 10, default switching; serviceability cached (second call no port invocation).
- Test stub: mounted under `NODE_ENV=test`; a test that boots with `NODE_ENV=development` asserts the route is absent.

### E2E

- `checkout.spec.ts` (task 13), with TN and non-TN address variants.

### Security

- No amount/price fields accepted from the client (schemas `.strict()`); tampering the Razorpay modal amount cannot change the server total (verify compares fetched payment amount).
- Webhook raw-body signature; `Idempotency-Key` scoped per user (another user with the same key gets a fresh order).
- Success page for a non-owner → 404 (not 403), no order number leakage.

### Coverage targets

- `modules/{orders,payments,tax,addresses,shipping}/**`: 95 %; `components/checkout/**`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Tax split proven for TN and non-TN carts with mixed rates; DB constraint never hit in tests (application always produces a valid pair)
- [ ] Idempotent create with concurrent-duplicate 409 demonstrated
- [ ] Webhook path proven independently of verify-payment; replay safe
- [ ] Release job restores stock and cancels; sweeper covers missed jobs
- [ ] Test stub provably absent outside `NODE_ENV=test`
- [ ] E2E checkout passes for captured, failed→retry, and timeout→cancelled

## 8. Senior engineer review notes

- **Ledger amendment:** DESIGN §9 mentions a `SALE` movement on payment. `ORDER_RESERVE` already decrements stock and the ledger forbids zero deltas, so no movement is written on payment; `SALE` remains reserved for future use (e.g. POS). Record this in DESIGN.md when merging.
- Calling Razorpay _before_ the DB transaction avoids holding a transaction open across a network call; orphaned unpaid Razorpay orders are harmless. Assert amount equality inside the transaction.
- Fetching the payment after signature verification is belt-and-braces: signatures prove origin, the fetch proves amount and capture state. Keep both.
- Never trust `handler` callbacks alone; the webhook must be able to complete the order. Users close tabs.
- `Idempotency-Key` per checkout _attempt_, rotated after success or `PRICE_CHANGED`, is what makes "Pay" safe to double-click and network retries safe.
- Raw body handling in Fastify needs a content-type parser that keeps the buffer; test the exact bytes path, JSON re-serialisation breaks signatures.
- Keep shipping as a single "standard" method in Phase 1; express/multi-courier choice is a P14/P25 concern.

## 9. Implementation prompt

```
You are implementing plan P12 from docs/plans/12-checkout-orders-tax-payments.md. Read DESIGN.md §3 WF-04, §7 Order/OrderItem/OrderStatusEvent/WebhookEvent, §9 Orders & payment + Webhooks, §10 Payments and GST (rounding rule), §11.3 Payments, and docs/plans/00-README.md (R4, R7, R9, R10, R11, R17). P11 and P13 are merged: use the cart pricing, hooks, applyMovement, nextOrderNumber, ShippingPort (fake), pg-boss, EmailPort templates (order-confirmation, order-cancelled), the BFF and the P09 components.

Deliver: scoped address CRUD; serviceability endpoint with Valkey cache; pure order pricing with per-line splitGst and free-shipping logic; Idempotency-Key handling in Valkey (IN_PROGRESS/DONE, 409 on concurrent duplicate); create-order service (cart + address validation, serviceability, pre-compute, Razorpay order via client, transaction with re-price assertion, order/items/event inserts, ORDER_RESERVE reservations with rollback on INSUFFICIENT_STOCK, release job scheduled at +30 min, cart cleared); verify-payment with timing-safe HMAC and a payment fetch asserting amount/captured, idempotent markPaid; the Razorpay webhook with raw-body signature verification, WebhookEvent idempotency and handlers for payment.captured/payment.failed/refund.processed; order-release job + 10-min sweeper; GET /orders and /orders/:id scoped (non-owner → 404); the NODE_ENV=test-only payment stub with a boot assertion; the /checkout page (ContactCard, AddressPicker/AddressForm with live serviceability, ShippingMethod, CouponField stub, OrderSummary with tax split, PayButton with per-attempt Idempotency-Key in sessionStorage, RazorpayLoader with CSP-allowed script, PaymentFailed retry) and the session-scoped success page.

Work test-first from P12 §6: pricing property tests (fast-check), signature vectors, idempotency and status state machines, webhook fixture parsers; integration tests with msw-mocked Razorpay for create/reserve/rollback/idempotency (including concurrent duplicates), verify and webhook paths, release and sweeper, address scoping, the test-stub absence check; then the checkout Playwright spec for captured, failed→retry and timeout→cancelled with TN and non-TN addresses.

Constraints: the client never sends money values, Razorpay called before the DB transaction with equality asserted inside it, no SALE movement on payment (reservation already decremented stock — note the DESIGN amendment in the PR), immutable data, files ≤ 400 lines, functions ≤ 50 lines, .strict() Zod everywhere.

When done: run all suites and the E2E on compose, complete the P12 Definition of Done with evidence, and stop for review.
```
