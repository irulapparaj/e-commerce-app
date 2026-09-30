# Journey Matrix — Phase 1

Maps DESIGN.md §3 workflow IDs to E2E spec files. A gap here is a failure of plan P18.

> WF-07, WF-08, WF-09, WF-10, WF-16 are Phase 3+ features and excluded from Phase 1 scope.

| ID | Workflow | Spec file(s) | Status |
|----|----------|-------------|--------|
| WF-01 | Browse & discovery | `journeys/browse.spec.ts` | 🟢 |
| WF-02 | Search | `journeys/browse.spec.ts` | 🟢 |
| WF-03 | Cart | `journeys/cart.spec.ts` | 🟢 |
| WF-04 | Checkout & payment | `journeys/checkout.spec.ts` | 🟡 enhanced with stub |
| WF-05 | Registration & login | `journeys/auth.spec.ts` | 🟢 |
| WF-06 | Account | `journeys/account.spec.ts` | 🟡 |
| WF-11 | Order tracking | `journeys/tracking.spec.ts` | 🟢 |
| WF-12 | Static pages | `journeys/static.spec.ts` | 🟢 |
| WF-13 | Newsletter | _(no spec)_ | 🔴 |
| WF-14 | Admin console | `journeys/admin-shell.spec.ts`, `journeys/admin-catalogue.spec.ts`, `journeys/admin-customers.spec.ts` | 🟡 |
| WF-15 | Returns | `journeys/returns.spec.ts` | 🟢 |
| WF-17 | Admin import | `journeys/admin-import.spec.ts` | 🟢 |

## Coverage key

- 🟢 Full coverage — spec tests the happy path and at least one error/edge path
- 🟡 Partial — happy path only or spec relies on a stub
- 🔴 Gap — no spec exists; this is a P18 blocker

## Phase exclusions

WF-07 (Wishlist), WF-08 (Product reviews), WF-09 (Gift cards), WF-10 (Loyalty / points), and
WF-16 (Advanced shipping rules) are Phase 3+ features. They are intentionally excluded from
Phase 1 coverage.

## Last run

> Fill in from CI after three consecutive green runs before tagging `v1.0.0-phase1`.
