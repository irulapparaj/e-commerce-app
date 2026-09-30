# P18 — Phase 1 QA: E2E suite, visual/a11y/CWV, exit checklist

|                  |                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development (exit)                                                                                                 |
| Estimated effort | 4 dev-days                                                                                                                  |
| Depends on       | P17                                                                                                                         |
| Unblocks         | P19                                                                                                                         |
| Design refs      | DESIGN.md §12 (Performance, Accessibility, Testing), §14 Phase 1 exit criteria, §4.2 (hosting-agnostic rules), R4, R14, R15 |
| Branch           | `feat/p18-phase1-qa`                                                                                                        |

## 1. Goal

Assemble everything written in P03–P17 into one reliable, CI-run end-to-end suite on the compose stack; add cross-browser, visual, accessibility and performance gates; verify the hosting-agnostic rules; and sign the Phase 1 exit checklist that P19 requires.

## 2. Scope

### In

- `tests/e2e` consolidation: shared fixtures (users, catalogue via P07 import, addresses), helpers (Mailpit OTP reader, payment stub, webhook fixture poster, fake-shipping clock, test-time hooks), per-spec data isolation, retry/quarantine policy
- CI `e2e` job: compose up, seed, run on Chromium/Firefox/WebKit + mobile (375) and tablet (768) projects; artifacts (traces, videos on failure)
- Visual regression baselines for all key pages × themes × 3 breakpoints; axe on every page; Lighthouse CI budgets; API load smoke
- Journey coverage matrix mapping DESIGN §3 workflows → specs
- Hosting-agnostic verification script; `docs/plans/phase1-exit-checklist.md`; release tag `v1.0.0-phase1`; demo script

### Out

- Any new product code (bugs found here are fixed in small PRs referencing the originating plan)

## 3. Deliverables

```
tests/e2e/{playwright.config.ts, global-setup.ts, global-teardown.ts}
tests/e2e/fixtures/{users.ts, catalogue.csv (50 products), addresses.ts, test-clock.ts}
tests/e2e/helpers/{mailpit.ts, payments.ts, webhooks.ts, shipping-clock.ts, admin.ts, db.ts}
tests/e2e/journeys/{browse, auth, cart, checkout, account, admin-*, static}.spec.ts  (moved/organised from plans)
tests/e2e/visual/*.spec.ts  tests/e2e/a11y/*.spec.ts
tests/perf/{lighthouserc.json, api-smoke.js (k6 or autocannon)}
scripts/{verify-hosting-agnostic.sh, demo.md}
docs/plans/phase1-exit-checklist.md  docs/testing/{journey-matrix.md, flaky-policy.md}
.github/workflows/ci.yml (+ e2e, visual, lighthouse jobs)  docker-compose.e2e.yml (finalised)
```

## 4. Tasks (ordered)

1. **Test-mode hooks (all gated by `NODE_ENV=test`, boot-asserted in P17).** API: `POST /__test__/clock { now }` (injectable clock used by release job, return windows, fake shipping), `POST /__test__/jobs/run { name }` (run a pg-boss job immediately), `POST /__test__/reset` (truncate + reseed minimal), the payment stub (P12), `POST /__test__/webhooks/shiprocket { fixture, awb }` (signs and posts). Web: none.
2. **Fixtures.** `catalogue.csv` (50 realistic products across the taxonomy, mixed GST rates, a few out-of-stock/low-stock) loaded through the P07 import in `global-setup`; users created via the OTP flow with Mailpit; addresses for TN and MH; `test-clock.ts` wraps the clock endpoint.
3. **Helpers.** `mailpit.ts` (`waitForMessage({ to, subjectIncludes })`, `extractOtp`, `extractLink`), `payments.ts` (`payViaStub(orderId, outcome)`; also a Razorpay script route stub so the real modal never loads), `webhooks.ts`, `shipping-clock.ts` (advance fake shipment states), `admin.ts` (login with seeded TOTP secret, step-up), `db.ts` (direct reads for assertions only).
4. **Consolidate specs** into `journeys/` with one data namespace per spec (unique email suffix), `test.describe.configure({ mode: 'serial' })` only where order matters, no shared mutable state; every spec cleans up or uses disposable users; tag `@critical` for the release-blocking set (browse, auth, cart, checkout, account, admin-orders, admin-import).
5. **Playwright config.** Projects: `chromium`, `firefox`, `webkit` (desktop 1440), `mobile-chromium` (375 × 812), `tablet` (768); `retries: 1` in CI, `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`; base URL from compose; global setup waits for `/readyz`.
6. **Visual & a11y.** Baselines (committed, per project) for: home, collection, PDP, search, cart page + drawer, checkout, success, login, account overview/order detail, about, FAQ, refund policy, admin dashboard/orders/product editor — light and dark. Axe on the same set with zero serious/critical; keyboard walkthrough spec for header → mega menu → product → add → drawer → checkout.
7. **Performance.** `lighthouserc.json` assertions on `/`, a collection, a PDP, an order detail (authenticated via cookie injection): LCP < 2.5 s, CLS < 0.1, TBT < 200 ms, total JS < 150 kB gzipped for landing routes; run with simulated 4G on the compose stack (production build). `api-smoke.js`: 50 rps for 60 s on `GET /products`, `/products/:slug`, `/search` with p95 < 300 ms and 0 errors (documented as a local/CI smoke, not capacity planning).
8. **Journey matrix.** `journey-matrix.md`: DESIGN §3 WF-01…WF-17 (Phase 1 subset) → spec file(s) → last run; gaps are failures of this plan.
9. **Hosting-agnostic verification.** `verify-hosting-agnostic.sh`: greps for cloud SDK imports outside `ports/adapters`, `process.env` reads outside `env.ts`, `NEXT_PUBLIC_` secrets, hard-coded hosts; checks `.env.example` vs schema keys; checks both Dockerfiles build and run with only `.env.example` values + compose; documented in the checklist.
10. **CI.** `e2e` job on PRs touching `apps/**` or `tests/**` and on `main`; `visual` and `lighthouse` jobs on `main` and on PR label `visual`; artifacts uploaded; flaky policy: a spec failing then passing on retry is tagged `@flaky` via a script that opens an issue, and `@flaky` specs run but do not block for at most 7 days (`flaky-policy.md`).
11. **Exit checklist.** `phase1-exit-checklist.md` with checkboxes and evidence links: all `@critical` journeys green on 3 browsers + mobile; coverage thresholds met per package (attach report); CI scanners clean; security suite + ZAP green; visual/axe/Lighthouse green; hosting-agnostic script clean; DESIGN §14 Phase 1 items each mapped to a merged PR; open bugs triaged (none Critical/High); demo script executed (`demo.md`: seed → browse → buy → ship → deliver → return placeholder); tag `v1.0.0-phase1`.

## 5. Contracts

- Test-mode endpoints exist only under `NODE_ENV=test`; any spec depending on them is CI-only against the compose stack.
- Data isolation: specs never share users or orders; helpers create what they need.
- Budgets in `lighthouserc.json` are the CWV contract for P19's production checks.

## 6. Test plan

- The suite itself, with these acceptance runs:
  - Full `@critical` set: 3 consecutive green CI runs on all projects (proves stability before tagging).
  - Visual: baselines reviewed in the PR; intentional diffs re-baselined with justification.
  - Axe: zero serious/critical on all listed pages; moderate findings logged as issues.
  - Lighthouse: budgets met on production builds; report attached.
  - API smoke thresholds met.
- Journey matrix has no gaps for Phase 1 workflows.

### Coverage targets

- Unchanged per package; this plan attaches the consolidated coverage report.

## 7. Definition of Done

- [ ] `phase1-exit-checklist.md` fully ticked with evidence links
- [ ] `@critical` journeys green ×3 on chromium/firefox/webkit/mobile/tablet
- [ ] Visual, axe, Lighthouse, API smoke gates green on `main`
- [ ] `verify-hosting-agnostic.sh` clean
- [ ] Tag `v1.0.0-phase1` created; demo executed and recorded (notes or video link)
- [ ] Journey matrix complete; flaky policy in place with zero `@flaky` at tag time

## 8. Senior engineer review notes

- Consolidation is where E2E suites die of flakiness: enforce per-spec data isolation and the clock/job hooks so nothing waits on real time.
- Three green runs before tagging is cheap insurance; one green run proves nothing about stability.
- Run Lighthouse on production builds in CI, not `next dev`; dev-mode numbers are meaningless and will cause false alarms in P19.
- Keep the API smoke honest: it is a regression tripwire on the compose stack, not a capacity claim. Real load characteristics come from P19 on the chosen tier.
- The hosting-agnostic script is the contract for P19's "configuration, not rework" promise; if it finds something, fix it now — it is far cheaper than during deployment.
- Do not let "just one more feature" into this plan; the exit checklist is the point.

## 9. Implementation prompt

```
You are implementing plan P18 from docs/plans/18-phase1-qa-e2e-exit.md. Read DESIGN.md §12, §14 Phase 1 exit criteria, §4.2 and docs/plans/00-README.md (R4, R14, R15, conventions §4). P03–P17 are merged and each shipped Playwright specs; this plan consolidates and gates them and adds no product features.

Deliver: NODE_ENV=test-only API hooks (clock, run-job, reset, Shiprocket webhook poster) with boot assertions, E2E fixtures (50-product catalogue loaded via the P07 import, users via Mailpit OTP, TN/MH addresses) and helpers (Mailpit, payment stub + Razorpay script stub, webhooks, shipping clock, admin login/step-up, db reads), the consolidated journeys/ specs with per-spec data isolation and @critical tags, Playwright config with chromium/firefox/webkit/mobile/tablet projects and failure artifacts, visual baselines and axe scans for the listed pages in both themes, Lighthouse CI budgets on production builds plus an API smoke script, the journey matrix and flaky policy docs, scripts/verify-hosting-agnostic.sh, CI jobs (e2e, visual, lighthouse) with artifacts, docs/plans/phase1-exit-checklist.md, and the v1.0.0-phase1 tag once everything is green three times.

Order of work: hooks and helpers → fixtures → consolidate specs → config/projects → visual/a11y → performance → matrix/docs → CI → checklist → tag. Fix any real bug found in a separate small PR that references the originating plan; never weaken a test to pass.

Constraints: no shared mutable state between specs, no real-time waits (use the clock and job hooks), production builds for performance runs, evidence links for every checklist item.

When done: attach the three green CI runs, coverage report, Lighthouse and axe reports, the hosting-agnostic script output and the completed checklist; then stop for the Phase 1 exit review.
```
