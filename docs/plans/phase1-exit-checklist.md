# Phase 1 Exit Checklist

> Sign-off gate for P19 (deployment). Every checkbox must be ticked with an evidence link before `v1.0.0-phase1` is tagged.

## 1. Journey coverage

- [ ] All `@critical` journeys green on Chromium, Firefox, WebKit, mobile-chromium, tablet — three consecutive CI runs
  - Evidence: _[paste CI run URLs]_
- [ ] Journey matrix (`docs/testing/journey-matrix.md`) has zero gaps (all rows 🟢 or explicitly scoped-out with justification)
  - Evidence: _matrix reviewed on [date]_

## 2. Plans P03 – P17: all merged and mapped

| Plan | Title | Merged PR |
|------|-------|-----------|
| P03 | Auth, sessions, MFA | |
| P04 | Catalogue API, media, search | |
| P05 | Admin shell, RBAC, audit, staff, settings | |
| P06 | Admin catalogue + inventory | |
| P07 | Admin import / export | |
| P08 | Admin customers, DPDP | |
| P09 | Storefront design system + shell | |
| P10 | Storefront catalogue pages | |
| P11 | Cart | |
| P12 | Checkout, orders, tax, payments | |
| P13 | Email notifications | |
| P14 | Shipping + admin orders | |
| P15 | Customer account | |
| P16 | Static pages, policies, SEO, forms | |
| P17 | Application security hardening | |

## 3. Test coverage

- [ ] API unit: ≥ 80% (attach `coverage/lcov.info` from CI)
- [ ] API integration: ≥ 80%
- [ ] Web unit: ≥ 80%
- Evidence: _[paste coverage report URL or attach]_

## 4. Static analysis / security

- [ ] `pnpm lint` passes on `main`
- [ ] `pnpm typecheck` passes on `main`
- [ ] `pnpm audit` — no critical/high findings, or each finding has a tracked exception
- [ ] Trivy image scan — no critical unfixed CVEs (see CI `security` job)
- [ ] OWASP ZAP baseline — all FAIL-severity findings in allowlist
- Evidence: _[paste CI run URL]_

## 5. Visual regression

- [ ] Visual baselines committed for all pages listed in `tests/e2e/visual/pages.spec.ts` (light + dark)
- [ ] No unreviewed diffs pending on `main`
- Evidence: _[paste CI visual run URL]_

## 6. Accessibility

- [ ] axe-core: zero serious/critical violations on all listed pages (light and dark)
- [ ] Keyboard walkthrough spec passes: skip link, mega menu, add-to-cart, drawer, checkout
- [ ] Reduced-motion spec passes
- Evidence: _[paste CI run URL]_

## 7. Performance (Lighthouse CI on production builds)

- [ ] LCP < 2.5 s on `/`, collection, PDP
- [ ] CLS < 0.1 on all measured routes
- [ ] TBT < 200 ms on all measured routes
- [ ] Total JS ≤ 150 KB gzipped on landing routes
- Evidence: _[paste Lighthouse CI report URL or attach `test-results/lighthouse/`]_

## 8. API smoke

- [ ] `node tests/perf/api-smoke.js` — p95 < 300 ms, 0 non-2xx on all three endpoints at 50 rps × 60 s
- Evidence: _[paste output]_

## 9. Hosting-agnostic verification

- [ ] `scripts/verify-hosting-agnostic.sh` exits 0 on `main`
- [ ] No cloud SDK imports outside `ports/adapters/`
- [ ] No `process.env` reads outside `env.ts`
- [ ] No `NEXT_PUBLIC_` secrets
- [ ] No hard-coded hostnames
- [ ] `.env.example` keys match schema
- [ ] Both Dockerfiles build and run with `.env.example` values + compose network
- Evidence: _[paste script output]_

## 10. Open bugs

- [ ] Zero Critical bugs open
- [ ] Zero High bugs open (or each has a documented accept-risk decision)
- [ ] All Medium+ findings from P17 security review are either fixed or have a tracked exception
- Evidence: _[paste issue tracker link]_

## 11. Flaky tests

- [ ] Zero `@flaky` tags in the test suite at tag time
- Evidence: `grep -r '@flaky' tests/` returns nothing

## 12. Demo

- [ ] `scripts/demo.md` walkthrough executed successfully by a human reviewer
  - Seed → Browse → Add to cart → Checkout (stub payment) → View order → Delivery webhook → Account order detail
- Evidence: _notes or recording link_

## 13. Release

- [ ] Tag `v1.0.0-phase1` created on the green `main` SHA
- [ ] Tag SHA matches the CI run in items 1 and 4
- Tagger: _name / date_
