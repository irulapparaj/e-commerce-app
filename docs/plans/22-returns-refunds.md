# P22 — Returns & refunds

|                  |                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                                                                                                    |
| Estimated effort | 5 dev-days                                                                                                                                                    |
| Depends on       | P19 · P14 (refund service, `createReversePickup`), P15 (order detail), P13 (templates), P08 (retention job)                                                   |
| Unblocks         | P26 (replacement orders reuse)                                                                                                                                |
| Design refs      | DESIGN.md §3 WF-15, §7 ReturnRequest, §8.1 Returns row, §9 (returns routes, `/uploads/return-photo`), §10 Returns policy, §11.2/§11.3 (Customer uploads), R11 |
| Branch           | `feat/p22-returns`                                                                                                                                            |

## 1. Goal

The fixed policy as software: customers request returns for defects within 15 days with photos; staff and admins run the queue through reverse pickup, QC, and refund or replacement; deductions are itemised; emails at every step; photos handled through the hardened pipeline and retained one year.

## 2. Scope

### In

- Customer: `POST /uploads/return-photo` (presigned, 4 max, ≤ 5 MB, jpeg/png/webp, 10/h), `POST /orders/:id/items/:itemId/return`, `GET /returns`, `GET /returns/:id`; order-detail entry point (`canRequestReturn` computed: `DELIVERED` and `now ≤ deliveredAt + 15 d`), request form with reason enum and photos, status timeline
- Admin: `/admin/returns` queue and detail; routes per §8.1 (`approve`⚡ with resolution, `reject`, `pickup` (STAFF; `ShippingPort.createReversePickup`), `receive`, `qc` (pass/fail + restock flag + note), `refund`⚡ (amount = line total − deduction), replacement (creates a ₹0 order linked via `replacementOrderId`, ships via P14)
- State machine `REQUESTED → APPROVED|REJECTED → PICKUP_SCHEDULED → RECEIVED → QC_PASSED|QC_FAILED → REFUNDED|REPLACED`; Shiprocket reverse-pickup webhook events; `reverse_pickup_charge_paise` setting (default 6000) used on QC fail; `RETURN_RESTOCK` movement only when the QC flag says resalable
- Emails: `return-received`, `return-approved`, `return-rejected`, `pickup-scheduled`, `return-refunded`, `return-replaced`; retention rule: photos deleted 1 y after resolution

### Out

- Change-of-mind returns (policy), exchanges for different products, partial-quantity returns (whole line only in this version)

## 3. Deliverables

```
apps/api/src/modules/returns/{routes.customer.ts, routes.admin.ts, state.ts, create.service.ts, qc.service.ts, resolve.service.ts, replacement.service.ts, photos.ts, dto.ts}
apps/api/src/modules/media/return-photo.job.ts  apps/api/src/modules/dpdp/retention.job.ts (+ photo rule)
apps/web/app/[locale]/account/orders/[id]/return/page.tsx  apps/web/components/returns/{ReturnForm, PhotoUpload, ReturnTimeline}.tsx
apps/web/app/admin/returns/{page.tsx, [id]/page.tsx}  apps/web/components/admin/returns/{ReturnQueue, ReturnDetail, ApproveDialog, QcDialog, RefundDialog}.tsx
apps/api/test/int/returns/*.test.ts  tests/e2e/returns.spec.ts
```

## 4. Tasks (ordered)

1. `state.ts`: pure transition table with actor requirements; every transition appends a `ReturnRequest` event (reuse `OrderStatusEvent`-style rows in a `ReturnEvent` table — add migration) and audit.
2. Photos: presigned PUT under `returns/{userId}/{uuid}`, job = magic bytes + Sharp re-encode + thumbnail, originals deleted; signed GET for owner and staff only; `photoKeys` 1–4 enforced by the DB check.
3. Create: window check with the injectable clock (R11), reason enum, one open request per order item (409), status `REQUESTED`, email `return-received`.
4. Admin queue: filters by status/age; detail with photos, order context, timeline; dialogs per action with §8.1 roles and step-up; `pickup` calls the port and stores `pickupAwb`; webhook maps reverse-pickup events to `PICKUP_SCHEDULED`/`RECEIVED`.
5. QC: pass/fail + `restock: boolean` (default false for consumables) + note; pass → `RETURN_RESTOCK` movement when restock; fail → `deductionAmount = reverse_pickup_charge_paise`.
6. Resolve: refund via P14 `refund.service` for `lineTotal − deduction` (itemised reason auto-generated), status `REFUNDED` on the `refund.processed` webhook; replacement = `replacement.service` creates a `CONFIRMED`/`PAID` ₹0 order with the same line, reserves stock, links ids, status `REPLACED` when the replacement is `DISPATCHED`.
7. Web pages (customer + admin) and E2E.

## 5. Contracts

- `POST /orders/:id/items/:itemId/return { reason, description, photoKeys[1..4] } → 201 { returnId }`; 409 `RETURN_WINDOW_CLOSED | RETURN_EXISTS | RETURN_NOT_ELIGIBLE`.
- `POST /admin/returns/:id/qc { result:'PASS'|'FAIL', restock: boolean, note }`.
- Refund amount rule: `lineTotal − (result === 'FAIL' ? reverse_pickup_charge : 0)`; never negative; never exceeds captured.
- `GET /orders/:id.canRequestReturn` per item.

## 6. Test plan

- **Unit:** transition table incl. illegal moves; window boundary at exactly 15 × 24 h; refund math with deduction and caps.
- **Integration:** photo upload constraints (5th photo, oversize, polyglot); create eligibility (not delivered, window closed via clock, duplicate, other user's item → 404); full happy path REQUESTED → … → REFUNDED with refund webhook; QC fail deduction; restock flag writes/does not write the movement; replacement order created at ₹0 with reservation and linked; RBAC per §8.1; emails enqueued per state; retention job deletes photos after 1 y (clock).
- **E2E:** customer files a return with two photos → staff schedules pickup (fake) → webhook received → QC pass → refund → customer sees REFUNDED and Mailpit has the mails; second scenario replacement.
- **Security:** photo signed GET denied to other users; IDOR on `/returns/:id`.
- **Coverage:** module 90 %.

## 7. Definition of Done

- [ ] Policy numbers (15 days, defects only, seller pays pickup, deduction on QC fail) encoded and tested
- [ ] Photo pipeline reuses the hardened media path; retention rule added
- [ ] Refund/replacement paths proven through webhooks
- [ ] Admin roles/step-up match §8.1

## 8. Senior engineer review notes

- Whole-line returns only: partial quantities multiply the edge cases (mixed QC results) for little value at this scale.
- Deduction is a policy constant in settings, not a free-text amount — keeps refunds predictable and auditable.
- Restock defaults to false: most items here are consumables; a wrong-item return is the main resalable case.
- Replacement as a ₹0 order keeps shipping, tracking and emails on the existing rails instead of a parallel flow.

## 9. Implementation prompt

```
You are implementing plan P22 from docs/plans/22-returns-refunds.md. Read DESIGN.md §3 WF-15, §7 ReturnRequest, §8.1 Returns, §9 returns routes and /uploads/return-photo, §10 Returns policy, §11.3 Customer uploads, and docs/plans/00-README.md (R11). P13, P14, P15, P08 and P19 are merged.

Deliver: the return state machine with a ReturnEvent table, customer photo uploads through the hardened media pipeline with signed reads, return creation with the 15-day window on the injectable clock and reason enum, the admin queue/detail with approve (⚡, resolution), reject, pickup via ShippingPort.createReversePickup, receive, QC (pass/fail, restock flag, note, deduction from the reverse_pickup_charge setting), refund via the P14 refund service finalised by webhook, replacement as a linked ₹0 order, reverse-pickup webhook mapping, the six emails, the photo retention rule, and customer/admin pages.

Work test-first from P22 §6 (transitions, window boundary, refund math, upload limits, eligibility, happy paths for refund and replacement, restock flag, RBAC, retention), then the returns Playwright spec.

Constraints: whole-line returns only, deduction only from settings, refunds never exceed captured, immutable data, files ≤ 400 lines, every admin action audited.

When done: run suites and E2E, complete the P22 Definition of Done with evidence, and stop for review.
```
