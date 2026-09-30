# P14 — Shipping port, Shiprocket adapter, admin orders

|                  |                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                         |
| Estimated effort | 5 dev-days                                                                                                                   |
| Depends on       | P12 (orders, payments client), P05 (admin shell), P13 (dispatch/delivered templates)                                         |
| Unblocks         | P15                                                                                                                          |
| Design refs      | DESIGN.md §3 WF-11, §8.1 Orders row, §9 Admin Orders + Webhooks (Shiprocket), §10 (Shipping), §11.3 (courier allow-list), R5 |
| Branch           | `feat/p14-shipping-admin-orders`                                                                                             |

## 1. Goal

Operators can see, ship, track, cancel and refund orders from the console; shipments are created through a `ShippingPort` whose fake adapter makes everything testable locally and whose Shiprocket adapter is ready for staging; courier status webhooks drive the order timeline and customer emails.

## 2. Scope

### In

- `ShippingPort` completed: `createShipment`, `track`, `cancelShipment`, `createReversePickup` (used by P22); `FakeShippingAdapter` with scripted progression; `ShiprocketAdapter` (token cache, pickup location from settings, create order → assign courier → AWB, track, cancel) built against recorded fixtures
- `POST /webhooks/shiprocket`: shared-secret header + source-IP allow-list, idempotency, status mapping → `OrderStatusEvent`, `deliveredAt`, emails
- Admin orders API: list/filter/search, detail, status change (allowed transitions), ship, tracking edit, address edit before dispatch (⚡), cancel (⚡, releases stock, refunds if paid), refund full/partial (⚡), internal notes
- Admin orders pages: list with filters, detail with timeline/items/address/actions, ship dialog with courier choice, refund dialog; dashboard stats now real (orders, revenue)
- Tracking URL builder from the courier allow-list

### Out

- Returns/reverse pickup flow (P22 — only the port method exists here), customer-facing tracking page (P15), reconciliation (P25), multi-courier rate shopping UI beyond the ship dialog

## 3. Deliverables

```
apps/api/src/ports/shipping.ts  (extended)  apps/api/src/ports/adapters/{fake-shipping.ts (extended), shiprocket.ts, shiprocket.types.ts}
apps/api/src/modules/shipping/{ship.service.ts, tracking-url.ts, status-map.ts, webhook.routes.ts}
apps/api/src/modules/admin/orders/{routes.ts, list.query.ts, detail.dto.ts, transitions.ts, cancel.service.ts, refund.service.ts, address-edit.service.ts}
apps/web/app/admin/orders/{page.tsx, [id]/page.tsx}
apps/web/components/admin/orders/{OrderTable, OrderFilters, OrderHeader, OrderItems, OrderTimeline, OrderAddress, ShipDialog, RefundDialog, CancelDialog, AddressEditDialog, NotesPanel}.tsx
tests/fixtures/shiprocket/{auth.json, serviceability.json, create-order.json, assign-awb.json, track.json, webhook-shipped.json, webhook-in-transit.json, webhook-delivered.json, webhook-rto.json}
apps/api/test/int/{shipping,admin-orders}/*.test.ts  apps/api/test/contract/shiprocket.test.ts  tests/e2e/admin-orders.spec.ts
```

## 4. Tasks (ordered)

1. **Port completion.** `ShippingPort` adds `createShipment({ order, pickupLocation, courierPreference? }) → { shipmentId, awb, courier, trackingUrl?, labelUrl? }`, `track(awb) → { status, events[] }`, `cancelShipment(shipmentId)`, `createReversePickup(...)` (signature only; P22 implements callers). Fake adapter: AWB `FAKE-{uuid}`, courier from a small table by PIN zone, `track` returns a scripted progression based on elapsed time since creation (shipped → in transit → delivered in test-controllable steps via a `FAKE_SHIPPING_CLOCK` hook), reverse pickup returns `RP-{uuid}`.
2. **Shiprocket adapter (R5).** Login → token cached in Valkey with expiry; `checkServiceability` (`/courier/serviceability` with pickup postcode from settings, delivery postcode, weight, `cod=0`), `createShipment` = `/orders/create/adhoc` (order number, items with HSN, address, payment `Prepaid`, dimensions/weight from variants) → `/courier/assign/awb` (courier chosen by cheapest serviceable respecting `courier_preferences`) → `/courier/generate/label` (optional); `track` = `/courier/track/awb/{awb}`; `cancelShipment`. Every response parsed with Zod (`shiprocket.types.ts`); unexpected shapes → `ShippingProviderError` with the raw body logged (redacted). All URLs from env `SHIPROCKET_BASE_URL`; never user-controlled. Contract tests use the fixtures via msw.
3. **Tracking URL.** `tracking-url.ts`: map courier name → URL template from the allow-list in `packages/shared`; unknown courier → the Shiprocket public tracking URL or `null`; never interpolate anything but the AWB (validated `^[A-Za-z0-9-]{6,40}$`).
4. **Status map & transitions.** `status-map.ts`: provider statuses → `DISPATCHED | IN_TRANSIT | DELIVERED | RETURNED(RTO) | null (ignore)`; `transitions.ts`: allowed manual transitions for admins (`CONFIRMED→DISPATCHED` only via ship; `DISPATCHED→IN_TRANSIT/DELIVERED` manual allowed with note; anything → `CANCELLED` only before `DISPATCHED`; `DELIVERED` terminal except `RETURNED` via P22); every transition appends `OrderStatusEvent { source, actorId, note }` and sets `deliveredAt` on `DELIVERED`.
5. **Webhook.** `POST /webhooks/shiprocket`: verify `x-api-key` header against `SHIPROCKET_WEBHOOK_SECRET` (timing-safe) **and** source IP ∈ `SHIPROCKET_WEBHOOK_IPS` (trust `X-Forwarded-For` only from configured proxies; document for P19); store `WebhookEvent { provider: SHIPROCKET, externalId: sha256(awb + status + timestamp) }`; map status; apply transition if forward-moving (ignore regressions/duplicates); emit `hooks.onOrderDispatched/onOrderDelivered` (P13 emails with tracking link); RTO → `RETURNED` with note.
6. **Ship service.** `ship.service.ship({ orderId, actor, courierPreference? })`: order must be `CONFIRMED` and `PAID`; call port; update `trackingNumber`, `courierName`, `shiprocketOrderId`, status `DISPATCHED`, event `ADMIN`, audit; emit `onOrderDispatched`; on provider error → 502 `SHIPPING_PROVIDER_ERROR` with a stable message, order unchanged.
7. **Cancel & refund.** `cancel.service` (ADMIN ⚡): allowed before `DISPATCHED`; `CANCELLED` + `ORDER_RELEASE` movements + event; if `PAID` → `refund.service.refund({ orderId, amount: total, reason })`; audit. `refund.service` (ADMIN ⚡): amount ≤ captured − already refunded; Razorpay refund via P12 client; `paymentStatus` becomes `PARTIALLY_REFUNDED`/`REFUNDED` when `refund.processed` webhook arrives (P12 handler) — until then a pending refund note in the timeline; itemised `reason` required (≥ 10 chars); audit. `address-edit.service` (ADMIN ⚡): before dispatch only; re-checks serviceability; snapshot updated; audit with before/after (redacted lines).
8. **Admin API.** `GET /admin/orders?status&paymentStatus&from&to&q(order no./email prefix/phone via blind index)&page` (STAFF), `GET /admin/orders/:id` (STAFF: full address lines visible for fulfilment, phone **masked** in the DTO, full phone only passed server-side to the port), `POST …/status { status, note }` (STAFF, per transitions), `POST …/ship { courierPreference? }` (STAFF), `PATCH …/tracking { trackingNumber, courierName }` (STAFF, manual correction, allow-list), `POST …/cancel` ⚡, `POST …/refund` ⚡, `PATCH …/address` ⚡, `POST …/notes` (STAFF). `GET /admin/stats` (P05) now reads real orders/revenue.
9. **Pages.** Orders list (`OrderTable` with status chips, payment chips, date/search filters, saved views "To ship", "In transit"), detail (`OrderHeader` actions by role/step-up, `OrderItems`, `OrderTimeline`, `OrderAddress` with masked phone + `MaskedValue` reveal via P08 only for ADMIN, `ShipDialog` (serviceability result, courier options, ETA), `RefundDialog` (amount ≤ refundable, reason), `CancelDialog`, `AddressEditDialog`, `NotesPanel`).
10. **E2E** `admin-orders.spec.ts`: seed an order paid via the P12 stub → STAFF ships it (fake adapter) → timeline shows DISPATCHED with AWB and Mailpit has the dispatch email with a tracking link → simulate the Shiprocket webhook (test helper posts a signed fixture) → IN_TRANSIT → DELIVERED with delivered email; ADMIN cancels a different paid order → stock restored, refund initiated (Razorpay mocked), refund webhook fixture → REFUNDED; STAFF cannot cancel (403).

## 5. Contracts

- Webhook auth: header `x-api-key` and source IP; 401/403 without either; 200 on replay.
- Admin order DTO: `phone` masked; `addressLines` visible; `tracking: { awb, courier, url }`.
- `POST …/refund { amountPaise, reason }` → 202 `{ refundId, status:'INITIATED' }`; 409 `REFUND_EXCEEDS_CAPTURED`.
- `hooks.onOrderDispatched({ orderId, awb, courier, trackingUrl })`, `hooks.onOrderDelivered({ orderId, deliveredAt })`.
- Fixtures in `tests/fixtures/shiprocket/` are the adapter's contract; updating them requires a staging capture (P19).

## 6. Test plan

### Unit

- Status map table (every provider status string in fixtures → internal status/null); transitions table incl. rejections; tracking URL builder (allow-list, AWB regex, unknown courier).
- Refund amount validation; cancel eligibility by status.

### Contract (msw + fixtures)

- Shiprocket adapter: login caching (second call no auth request), serviceability parse, create → assign → AWB flow with correct payload (order number, HSN, prepaid, pickup location), track parse, error shape on 4xx/5xx and on malformed JSON.

### Integration (fake adapter; Razorpay mocked)

- Ship: CONFIRMED+PAID → DISPATCHED, tracking set, audit, dispatch email job with tracking URL; unpaid → 409; provider error → 502 and unchanged.
- Webhook: valid header + IP → transition + email; wrong header → 401; disallowed IP → 403; replay → no second event; regression (DELIVERED then IN_TRANSIT) ignored; RTO → RETURNED.
- Cancel: before dispatch → CANCELLED + `ORDER_RELEASE` (ledger sums back) + refund call with full amount; after dispatch → 409; STAFF → 403; step-up required.
- Refund: partial then remaining → second exceeding → 409; `refund.processed` fixture → `PARTIALLY_REFUNDED` then `REFUNDED`.
- Address edit before dispatch updates snapshot (encrypted) with audit; after dispatch → 409; unserviceable new PIN → 409.
- List filters and search by blind-indexed phone; STAFF DTO phone masked (regex scan).
- Stats reflect paid orders and revenue in paise.

### E2E

- `admin-orders.spec.ts` (task 10).

### Security

- Webhook secret compared timing-safe; `X-Forwarded-For` trusted only from `TRUSTED_PROXIES`.
- Tracking links built only from the allow-list (fuzz courier names).

### Coverage targets

- `modules/shipping/**`, `modules/admin/orders/**`, `ports/adapters/shiprocket.ts`: 90 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Fake adapter drives the full ship → deliver lifecycle in tests and E2E
- [ ] Shiprocket adapter passes contract tests against fixtures; no live calls in CI
- [ ] Webhook auth (secret + IP), idempotency and regression handling proven
- [ ] Cancel/refund gated by step-up, audited, ledger-correct
- [ ] Role table for admin order routes matches DESIGN §8.1

## 8. Senior engineer review notes

- The fake adapter is not a mock: it is the local implementation of the port and must be good enough to run the whole business flow. Invest in its scripted progression.
- Shiprocket's API has changed shape over the years; keep every response behind Zod and keep the fixtures as the contract. P19 replaces fixtures with staging captures.
- Refunds are asynchronous at Razorpay; the timeline shows "refund initiated" until the webhook confirms. Do not mark REFUNDED on the API call.
- IP allow-listing depends on knowing the proxy chain; make `TRUSTED_PROXIES` explicit now so P19 only fills the values.
- Address edits after dispatch are a courier problem, not a database one — refuse them.
- STAFF must see address lines to ship parcels; masking applies to phone (and to the Customers page). This is a deliberate exception to the general masking rule; keep it documented in the DTO.

## 9. Implementation prompt

```
You are implementing plan P14 from docs/plans/14-shipping-admin-orders.md. Read DESIGN.md §3 WF-11, §8.1 Orders row, §9 Admin Orders and Webhooks (Shiprocket), §10 Shipping, §11.3 courier allow-list and docs/plans/00-README.md (R5). P12, P05 and P13 are merged: use the orders/payments modules (Razorpay refund client, markPaid, hooks), applyMovement, WebhookEvent, audit.record, security counters, the P05 admin shell and P08 MaskedValue.

Deliver: the completed ShippingPort with an extended FakeShippingAdapter (scripted progression, test clock) and a Shiprocket adapter (token cache, serviceability, adhoc order → courier assignment → AWB, track, cancel; every response Zod-parsed; contract tests against tests/fixtures/shiprocket via msw); tracking URL builder from the courier allow-list; status map and transition rules; the Shiprocket webhook with timing-safe secret + source-IP allow-list (X-Forwarded-For only from TRUSTED_PROXIES), idempotency, forward-only transitions, RTO → RETURNED, and dispatch/delivered hooks; ship/cancel/refund/address-edit services with the §8.1 roles and step-up; admin orders API (list/filter/search incl. blind-index phone, masked-phone detail, status, ship, tracking edit, cancel, refund, address, notes) and pages (OrderTable, filters, detail with timeline/items/address, Ship/Refund/Cancel/AddressEdit dialogs, notes); real /admin/stats.

Work test-first from P14 §6: status/transition/tracking-URL unit tests, Shiprocket contract tests, integration tests for ship, webhook auth/idempotency/regressions, cancel with ledger release and refund call, partial refunds and the refund.processed webhook, address edit rules, RBAC and masked DTO scans; then the admin-orders Playwright spec driving the fake adapter and signed webhook fixtures.

Constraints: no live provider calls in tests, refunds only marked by webhook confirmation, address edits refused after dispatch, immutable data, files ≤ 400 lines, every mutation audited.

When done: run all suites and the E2E on compose, complete the P14 Definition of Done with evidence, and stop for review.
```
