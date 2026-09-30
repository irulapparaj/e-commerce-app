# P25 — Ops: payment reconciliation, dashboard depth, bestselling

|                  |                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                                                    |
| Estimated effort | 3 dev-days                                                                                                    |
| Depends on       | P19 · P12 (payments client, webhooks), P05 (dashboard, security page), P07 (exports)                          |
| Unblocks         | P26 (COD remittance reconciliation reuses the job)                                                            |
| Design refs      | DESIGN.md §8.1 Dashboard + Security & Health rows, §10 Payments (reconciliation), §11.3 Payments, §14 Phase 3 |
| Branch           | `feat/p25-ops`                                                                                                |

## 1. Goal

Close the loop between Razorpay and the order book every day, give the operator a dashboard that answers "how is the store doing", and add the `bestselling` sort the catalogue has been waiting for.

## 2. Scope

### In

- `payment-reconcile` daily job: Razorpay payments (and refunds) for the previous day vs orders; `ReconciliationRun` model with mismatches (missing order, amount mismatch, paid-but-PENDING, refund mismatch); admin view on `/admin/security` + alert counter; manual re-run
- Dashboard depth: revenue by day (30 d), orders, AOV, repeat-customer rate, top products, low stock, pending returns, funnel counters (carts created → checkouts started → paid) via Valkey counters emitted by P11/P12
- `ProductStats` nightly job (`salesCount`, `revenuePaise` last 90 d) → `bestselling` sort on collections and a "Best Sellers" home section driven by data
- Weekly summary email to ADMIN (optional toggle in settings)

### Out

- Accounting exports beyond P07, BI tooling, COD remittance (P26)

## 3. Deliverables

```
apps/api/src/modules/ops/{reconcile.job.ts, reconcile.routes.ts, stats.job.ts, funnel.counters.ts, weekly-summary.job.ts}
apps/api/prisma/migrations/* (ReconciliationRun, ProductStats)
apps/api/src/modules/catalogue/filters.ts (+ bestselling)  apps/api/src/modules/admin/stats.routes.ts (extended)
apps/web/app/admin/page.tsx (charts via Recharts)  apps/web/components/admin/dashboard/{RevenueChart, FunnelCard, TopProducts}.tsx
apps/api/test/int/ops/*.test.ts  tests/e2e/admin-dashboard.spec.ts
```

## 4. Tasks (ordered)

1. Reconcile job (02:30 IST): page Razorpay `payments?from&to` and `refunds`; match by `razorpayPaymentId`/`razorpayOrderId`; classify mismatches; persist run; counter + email alert on any mismatch; route `POST /admin/ops/reconcile { date }` (ADMIN) and `GET /admin/ops/reconciliation` list/detail.
2. Funnel counters: `funnel:{day}:{stage}` increments from cart create (P11), checkout page load (web → BFF ping), order created, order paid (P12); dashboard reads 30-day series.
3. `stats.job` nightly: aggregate `OrderItem` over paid, non-cancelled orders (90 d) into `ProductStats`; `bestselling` sort joins it (default sort stays `featured`); home "Best Sellers" prefers stats, falls back to featured.
4. Dashboard: `RevenueChart` (daily revenue in ₹ with tabular labels; token colours; dark-mode aware), AOV, repeat rate (customers with ≥ 2 paid orders / customers with ≥ 1), top 10 products, low stock, pending returns, funnel card; date range 7/30/90 d.
5. Weekly summary email (Mon 09:00 IST) to ADMINs when enabled; P13 template.
6. E2E dashboard with seeded orders.

## 5. Contracts

- `ReconciliationRun { id, date, checkedPayments, checkedRefunds, mismatches: Mismatch[], status }`; `Mismatch { type, razorpayId?, orderId?, expected, actual }`.
- `GET /admin/stats?range=7|30|90` extended shape; all money in paise.
- `sort=bestselling` documented in the catalogue API.

## 6. Test plan

- **Unit:** mismatch classification table; AOV/repeat-rate math; stats ranking.
- **Integration (msw Razorpay list fixtures):** clean day → no mismatches; missing order → mismatch + counter + alert email; amount mismatch; refund not reflected; manual re-run idempotent (same run replaced); stats job → `bestselling` order correct; funnel counters increment from the real endpoints; dashboard route shapes; RBAC.
- **E2E:** dashboard renders chart and cards from seeded data; reconciliation page lists a mismatch after posting a fixture.
- **Coverage:** modules 85 %.

## 7. Definition of Done

- [ ] Daily reconciliation running with alerts; manual re-run available
- [ ] Dashboard answers revenue/AOV/repeat/top/funnel for 7/30/90 d
- [ ] `bestselling` live on collections and home

## 8. Senior engineer review notes

- Reconciliation is the control that catches webhook misses and double captures; treat any mismatch as an incident to explain, not a number to watch.
- Funnel counters are approximate by design (Valkey, no PII); do not turn them into per-user tracking here — that is P27's consented analytics.
- Keep charts on the design tokens; a default-styled Recharts chart looks like a template.

## 9. Implementation prompt

```
You are implementing plan P25 from docs/plans/25-ops-reconciliation-dashboard.md. Read DESIGN.md §8.1 Dashboard and Security & Health, §10 Payments (reconciliation), §11.3 Payments. P05, P07, P12 and P19 are merged.

Deliver: the daily payment-reconcile job with a ReconciliationRun model, mismatch classification, alert counter + email, manual re-run and admin views; funnel counters wired into cart creation, checkout start, order created and paid; the nightly ProductStats job with the bestselling sort and data-driven Best Sellers; the dashboard with revenue chart, AOV, repeat rate, top products, low stock, pending returns and funnel for 7/30/90 days; the optional weekly summary email.

Work test-first from P25 §6 with msw Razorpay list fixtures, then the admin-dashboard Playwright spec.

Constraints: money in paise, counters without PII, charts on design tokens, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P25 Definition of Done with evidence, and stop for review.
```
