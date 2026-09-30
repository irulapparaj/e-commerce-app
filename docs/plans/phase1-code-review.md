# Phase 1 code review gate (run before P19)

|                  |                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development (exit review)                                                                    |
| Estimated effort | 1–2 dev-days (mostly agent time)                                                                      |
| Depends on       | P01–P18 implemented in the working tree                                                               |
| Unblocks         | P19                                                                                                   |
| Design refs      | DESIGN.md §3 (WF-01…WF-17), §4.2, §11, §12, §14 Phase 1 exit criteria; 00-README.md §4 conventions    |
| Branch           | `chore/phase1-review` (report only; fixes go in `fix/pNN-*` branches referencing the owning plan)     |

## 1. Goal

Produce one written, evidence-backed review of everything built from P01–P18 so that P19 (deployment and go-live) starts from a known baseline: which plan DoD items are actually met, which CRITICAL/HIGH defects exist, and whether the P18 E2E suite and exit checklist genuinely prove the DESIGN §14 Phase 1 exit criteria rather than merely existing.

## 2. Scope

### In

- Plan-by-plan conformance check (P04–P18) against each plan's Scope, Deliverables, Contracts and Definition of Done
- Full gate run: lint, typecheck, unit + coverage, integration (compose), migration drift, E2E on all Playwright projects
- P18 exit-gate verification: journey matrix vs actual specs vs DESIGN §3 WF IDs, `@critical` stability (three runs), visual/axe/Lighthouse/API-smoke gates, hosting-agnostic script, CI `e2e`/`visual`/`lighthouse` jobs actually triggering, exit checklist evidence, release tag
- Parallel specialist reviews: security, database, TypeScript, test quality, E2E reliability, silent failures

### Out

- Any product or test code change (fixes are separate small PRs that cite the finding and the owning plan)
- Weakening, skipping or quarantining any failing test to get a green run

## 3. Deliverables

```
docs/reviews/2026-09-phase1-review.md
```

Sections, in order: executive summary and go/no-go for P19; plan-by-plan DoD table with evidence (P04–P18); P18 exit-gate verification table; findings by severity (CRITICAL / HIGH / MEDIUM / LOW); verbatim command outputs; journey coverage table (DESIGN WF → spec → per-project result).

## 4. Tasks (ordered)

1. Read `docs/plans/00-README.md` §4, `docs/DESIGN.md` §3, §4.2, §11, §12, §14 once. Only P01–P03 are committed; P04–P18 are uncommitted in the working tree, so the review is whole-tree, not a diff.
2. Run the gates and capture output verbatim: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` (compose up), `pnpm db:drift`, `pnpm test:e2e` on chromium, firefox, webkit, mobile-chromium and tablet against `docker-compose.e2e.yml`, then `pnpm test:e2e --grep @critical` three consecutive times. Also run `scripts/verify-hosting-agnostic.sh`, the Lighthouse CI config in `tests/perf/lighthouserc.json` against a production build, and `tests/perf/api-smoke.js`.
3. For each plan P04–P17: map plan deliverables to files under `apps/api/src/modules/*`, `apps/web/app/(storefront|admin)`, `apps/web/lib`, `packages/shared/src`; mark each DoD item met / partial / missing with a file or test as evidence.
4. For P18, verify each deliverable in §3 and each DoD box in §7 of `18-phase1-qa-e2e-exit.md` against the tree. On 2026-09-26 the tree had: nine specs in `tests/e2e/journeys/` (seven tagged `@critical`), helpers, fixtures, global setup/teardown, the five-project config, `visual/pages.spec.ts`, `a11y/pages.spec.ts`, `tests/perf/`, `docs/testing/{journey-matrix,flaky-policy}.md`, `docs/plans/phase1-exit-checklist.md`, `scripts/{verify-hosting-agnostic.sh,demo.md}`, and CI `e2e`/`visual`/`lighthouse` jobs. Verify these specific points rather than assuming them:
   - The six pre-P18 specs (`admin-catalogue`, `admin-customers`, `admin-import`, `admin-shell`, `auth`, `smoke`) still sit at `tests/e2e/` beside `journeys/`; `admin-catalogue.spec.ts` was never moved even though the matrix cites `journeys/admin-catalogue.spec.ts`. Decide which copies are live and whether duplicates run twice.
   - `journey-matrix.md` uses its own WF numbering (its WF-03 is "View product detail", its WF-08 is "Payment stub"), not DESIGN §3 (WF-03 Cart, WF-11 Order tracking, WF-14 Admin console, WF-17 Admin import). Remap every row to the DESIGN IDs and report real gaps: no `admin-orders` journey (DESIGN WF-14 orders/shipping, marked partial), no dedicated search spec (DESIGN WF-02, folded into `browse.spec.ts`).
   - `visual/pages.spec.ts` has no committed `-snapshots` directory; only `shell.spec.ts` has baselines (18 files). Confirm whether page baselines were generated per project and theme.
   - `phase1-exit-checklist.md` has 0 of 34 boxes ticked and no evidence links; the matrix "Last run" section is unfilled; there is no `v1.0.0-phase1` tag. By P18's own DoD this is not exit-ready; state it plainly.
   - The CI `e2e` job's `if:` uses `contains(github.event.pull_request.changed_files, 'apps/')`; on the `pull_request` event `changed_files` is an integer count, so the condition is never true on PRs and the job runs only on push. Confirm and file it against P18.
   - Every `/__test__/*` route in `apps/api/src/modules/test-hooks/routes.ts` is refused outside `NODE_ENV=test` with a boot assertion (P17 contract).
5. Launch specialist agents in parallel and merge their findings (see prompt §9 for the exact surfaces).
6. Build the journey coverage table keyed by DESIGN §3 IDs: WF-01…WF-17 (Phase 1 subset) → spec file → last run result on each project; list every disagreement with `docs/testing/journey-matrix.md`.
7. Assemble the report; every finding carries `file:line`, defect, impact, concrete fix, owning plan.

## 5. Contracts

- Severity scale and approval rule follow the workspace code-review standard: CRITICAL blocks, HIGH should be fixed before P19, MEDIUM/LOW are logged.
- The report is the input contract for P19's go-live decision and the VAPT starting point; the journey coverage table (DESIGN IDs) supersedes any journey matrix it disagrees with.

## 6. Test plan

- Not applicable beyond running the existing gates; the report itself is the artefact.

## 7. Definition of Done

- [ ] All gate commands run on every Playwright project; outputs recorded verbatim (failures included)
- [ ] Every plan P04–P18 has a DoD row with evidence
- [ ] P18 exit-gate table lists each §3 deliverable and §7 DoD item as present/verified or missing, including the six points in task 4
- [ ] `@critical` set run three times; flakiness recorded per spec and project
- [ ] Zero unrecorded CRITICAL findings; every finding has file:line, fix and owning plan
- [ ] Journey coverage table covers DESIGN WF-01…WF-17 with the matrix remapped
- [ ] Go / no-go for P19 stated in one paragraph

## 8. Senior engineer review notes

- Review before deploying; P19 is the wrong place to discover that a checkout spec passes only because it never reaches the payment stub.
- Commit the working tree first (one `wip(phase1): P04–P18` commit is enough) so fix PRs are clean diffs and the review can cite a SHA.
- Treat "spec exists", "spec runs" and "spec proves the workflow" as three different columns; a matrix that renumbers the workflows can show all-green while DESIGN WF-14 has no spec.
- Three consecutive `@critical` runs is the minimum stability evidence; one green run is not evidence, and an unticked exit checklist is not a sign-off.
- Do not let the reviewer fix things inline. A review session that edits code loses the audit trail and hides how many defects there were.

## 9. Implementation prompt

```
You are reviewing the Puja Essentials monorepo from the repo root (pnpm workspace: apps/api Fastify + Prisma, apps/web Next.js App Router, packages/shared, packages/config). It was built plan-by-plan from docs/plans/01 to 18 against docs/DESIGN.md. Only P01 to P03 are committed; P04 to P18 are in the working tree, so review the whole tree, not a diff. Follow docs/plans/phase1-code-review.md, especially the six verify-first points in its task 4.

Goal: a written review that says, per plan, whether the code meets that plan's Scope, Contracts, Test plan and Definition of Done, whether the P18 E2E suite and exit checklist genuinely prove the Phase 1 exit criteria, and what must be fixed before P19 (deployment and go-live).

Method:
1. Read docs/plans/00-README.md (conventions and R-rules), docs/DESIGN.md sections 3 (WF-01 to WF-17), 4.2, 11, 12 and 14 once. Use the DESIGN section 3 WF numbering everywhere; docs/testing/journey-matrix.md uses a different numbering and must be remapped, not trusted.
2. For each plan 04 to 17: read its Scope, Deliverables, Contracts and DoD, then the implementing code (apps/api/src/modules/*, apps/web/app/(storefront) and (admin), apps/web/lib, packages/shared/src) and its tests (apps/api/test, co-located *.test.ts, tests/e2e).
3. For plan 18: verify every item in its section 3 deliverables and section 7 DoD against the tree and record present/missing, and check the six points in the review plan's task 4: duplicate pre-P18 specs beside tests/e2e/journeys and the unmoved admin-catalogue spec; matrix WF renumbering and the missing admin-orders and search journeys; absent visual baselines for visual/pages.spec.ts; the exit checklist with 0 of 34 boxes ticked, the unfilled matrix Last run section and the missing v1.0.0-phase1 tag; the CI e2e job condition that compares an integer changed_files count against a path string so the job never runs on PRs; and NODE_ENV=test gating with boot assertions on every /__test__ route.
4. Run and record verbatim: pnpm lint, pnpm typecheck, pnpm test (with coverage), pnpm test:int on the compose stack, pnpm db:drift, pnpm test:e2e on all five Playwright projects against docker-compose.e2e.yml, pnpm test:e2e --grep @critical three consecutive times, scripts/verify-hosting-agnostic.sh, Lighthouse CI with tests/perf/lighthouserc.json on a production build, and tests/perf/api-smoke.js. Never weaken, skip or quarantine a failing test; report it.
5. Launch these agents in parallel and merge their findings:
   - security-reviewer: auth/sessions/MFA/BFF cookies (P03, P17), Razorpay webhook signature and idempotency (P12), Shiprocket webhook (P14), CSV/XLSX import and media upload hardening (P04, P07), DPDP PII reveal/erasure (P08), RBAC and step-up (P05), rate limits, CSP/headers, and that every /__test__ hook in apps/api/src/modules/test-hooks is gated by NODE_ENV=test with a boot assertion.
   - database-reviewer: Prisma schema, migrations, indexes, money and GST rounding (TN CGST/SGST vs IGST), inventory movements, order state machine.
   - typescript-reviewer: apps/web, apps/api, packages/shared.
   - pr-test-analyzer: are existing unit and integration tests behavioural; coverage vs 80% overall and 95% for money, tax, auth, cart, orders, payments (00-README.md section 4 Testing).
   - e2e-runner: E2E reliability only. Locator quality (role/label/test-id, no CSS or XPath), fixed sleeps, shared mutable state between specs, data isolation, use of the clock and job hooks, per-project flakiness across the three @critical runs, visual baseline completeness (pages x themes x breakpoints per project), axe results.
   - silent-failure-hunter: jobs, notifications, webhooks, revalidation, email suppression, global-setup and teardown.
6. Severity CRITICAL / HIGH / MEDIUM / LOW. Each finding: file:line, what is wrong, why it matters, concrete fix, owning plan number.

Deliverable: docs/reviews/2026-09-phase1-review.md containing (a) executive summary and a go/no-go for starting P19, (b) plan-by-plan table of DoD items met/unmet with evidence for P04 to P18, (c) P18 exit-gate verification table covering the six task-4 points, (d) findings grouped by severity, (e) command outputs in fenced blocks, (f) a journey coverage table keyed by DESIGN WF-01 to WF-17 with spec file and per-project result, listing every disagreement with docs/testing/journey-matrix.md. Do not change product or test code in this session; I will read the report and decide what to fix.
```
