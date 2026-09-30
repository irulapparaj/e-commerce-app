# P05 — Admin shell: RBAC, audit, staff, settings, security page

|                  |                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                |
| Estimated effort | 5 dev-days                                                                                                          |
| Depends on       | P03 (guards, MFA, staff API) · uses `audit.record` from P04 if merged, else adds it                                 |
| Unblocks         | P06, P07, P08, P14                                                                                                  |
| Design refs      | DESIGN.md §3 WF-14, §8.1 (menu + role matrix), §9 Admin (Staff, Governance, Settings), §11.3 (Admin hardening), R13 |
| Branch           | `feat/p05-admin-shell`                                                                                              |

## 1. Goal

The admin console skeleton every later admin plan plugs into: layout and navigation driven by the §8.1 role matrix, the step-up UX, the audit log (API + page), staff & roles management, settings with per-key schemas (brand placeholder, GST profile placeholder, pickup location, thresholds, return window), the security & health page, and a dashboard with basic counts. Utilitarian styling using the design tokens; the admin is not a brand surface.

## 2. Scope

### In

- API: `GET /admin/audit` (filters, pagination), `GET/PUT /admin/settings/:key` (schema per key, step-up), `GET /admin/staff`, `POST /admin/staff/:id/role`, `POST /admin/staff/:id/mfa-reset`, `POST /admin/staff/:id/revoke-sessions`, `GET /admin/security`, `GET /admin/stats`; failed-login and webhook-failure counters
- Web: `app/admin/layout.tsx` (sidebar, role-aware nav, user menu, step-up dialog provider), shared admin components (`DataTable`, `FormField`, `ConfirmDialog`, `StepUpDialog`, `Toast`, `PageHeader`, `EmptyState`), pages: `/admin` (dashboard), `/admin/settings`, `/admin/staff`, `/admin/audit`, `/admin/security`; admin API client using the BFF with automatic step-up handling
- Admin-specific CSP (no Razorpay origins) via the web app's header middleware

### Out

- Catalogue/inventory/import/customers/orders pages (P06–P08, P14); email template editing UI (P13 stores templates as code in Phase 1)

## 3. Deliverables

```
apps/api/src/modules/admin/{audit.routes.ts, settings.routes.ts, settings.schemas.ts, staff.routes.ts, security.routes.ts, stats.routes.ts}
apps/api/src/modules/security-events/{counters.ts}   # Valkey counters: failed logins, webhook signature failures
apps/web/app/admin/{layout.tsx, page.tsx, settings/page.tsx, staff/page.tsx, audit/page.tsx, security/page.tsx}
apps/web/components/admin/{Sidebar.tsx, Nav.config.ts, DataTable.tsx, FormField.tsx, ConfirmDialog.tsx, StepUpDialog.tsx, StepUpProvider.tsx, Toast.tsx, PageHeader.tsx, EmptyState.tsx, MaskedValue.tsx}
apps/web/lib/admin/{api.ts, rbac.ts}
apps/web/lib/security-headers.ts   # CSP builder used by middleware for /admin vs storefront
apps/api/test/int/admin/*.test.ts  apps/web/components/admin/*.test.tsx  tests/e2e/admin-shell.spec.ts
```

## 4. Tasks (ordered)

1. **Settings schemas.** `settings.schemas.ts`: one Zod schema per key — `announcement_bar { enabled, text ≤ 120 }`, `promo_popup { enabled, productSlug?, headline?, delaySeconds 3–10 }`, `free_shipping_threshold (paise ≥ 0)`, `brand { name ≤ 40, tagline ≤ 80, logoKey?: png/webp key }`, `gst_profile { gstin /^33[0-9A-Z]{13}$/ , legalName, addressLines, isPlaceholder: boolean }`, `pickup_location { name, line1, line2?, city, state:'TN', pincode, phone }`, `return_window_days (7–30)`, `courier_preferences { preferred[]: allow-list }`. Unknown key → 404; invalid → 400 with field errors.
2. **Settings routes.** `GET /admin/settings` (all keys, STAFF read), `PUT /admin/settings/:key` (ADMIN + step-up), writes audit before/after, invalidates `settings:public` cache, enqueues `revalidate ['home']` when brand/announcement change.
3. **Staff routes** (ADMIN + step-up for mutations): list users with role ∈ {ADMIN, STAFF} (`mfaEnabled`, last login, sessions count); `role` change (cannot demote the last ADMIN; revokes all sessions; audit); `mfa-reset` (clears secret + recovery codes, `mfaEnabled=false`, revokes sessions, sends re-enrol email); `revoke-sessions`.
4. **Audit read.** `GET /admin/audit?actorId&entityType&entityId&action&from&to&page` (ADMIN), newest first; `before/after` returned as stored (already redacted at write).
5. **Security counters.** `security-events/counters.ts`: Valkey counters with 24 h windows for `auth.otp.failed`, `auth.mfa.failed`, `webhook.signature.invalid.{provider}`; hooks called from P03 verify and (later) webhook handlers. `GET /admin/security` → `{ adminSessions[] (user, ip, ua, lastUsedAt), failedLogins24h, mfaFailures24h, webhookFailures24h by provider, reconciliationMismatches: null (P25) }`.
6. **Stats.** `GET /admin/stats` → counts: orders today/7d (0 until P12), revenue today/7d (paise), products active, low-stock count (variants below threshold), pending returns (0 until P22), customers total; cheap aggregate queries, cached 60 s.
7. **RBAC on the web.** `Nav.config.ts` encodes §8.1: each item `{ href, label, roles: ['ADMIN'|'STAFF'], stepUpActions?: [] }`; `rbac.ts` `canSee(item, role)`. The sidebar hides items the role cannot use; the API remains the enforcement point (tested).
8. **Step-up UX.** `StepUpProvider` wraps the admin tree; `lib/admin/api.ts` intercepts `403 STEP_UP_REQUIRED` (API guard from P03 returns this code) → opens `StepUpDialog` (TOTP input) → calls BFF `/api/auth/step-up` → retries the original request once. Visible countdown of the 5-min window in the user menu.
9. **Layout & components.** Sidebar (collapsible, keyboard navigable), top bar with environment badge (`NODE_ENV`), user menu (role, MFA status, log out, log out everywhere); `DataTable` (server pagination, sort, column filters, empty state, sticky header); `FormField` (label, help, error from Zod issues); `ConfirmDialog`; `Toast`; `MaskedValue` (renders `98•••••210` with a "Reveal" affordance used by P08). Plain, dense, high-contrast; tokens only.
10. **Pages.** Dashboard (stat tiles + "GST profile is a placeholder" warning banner while `gst_profile.isPlaceholder`); Settings (tabbed per key with Zod-driven forms; PUT triggers step-up); Staff (table, invite dialog → `POST /admin/staff` from P03, role select, MFA reset, revoke sessions, all with confirm + step-up); Audit (filter bar, table with before/after diff drawer); Security (sessions table with revoke, counters, webhook failures).
11. **Admin CSP.** `security-headers.ts` builds the storefront CSP (with Razorpay origins) and the admin CSP (without); middleware applies by path prefix; nonce generated per request and passed to the layout for inline scripts. (Full header set is finalised in P17; this PR makes the split real so P12 can add Razorpay only where needed.)
12. **E2E** `admin-shell.spec.ts`: admin logs in (TOTP), changes `free_shipping_threshold` → step-up dialog → saved → audit row visible; STAFF user sees no Settings/Staff nav and gets 403 on direct navigation (page shows "not permitted").

## 5. Contracts

- `GET /admin/settings → { data: Record<key, value> }`; `PUT /admin/settings/:key { value } → { data: value }`; 403 `STEP_UP_REQUIRED` when the claim is missing/expired (from P03 guard).
- `GET /admin/audit → { data: AuditRow[], meta }`; `AuditRow { id, actor { id, email(hashed display), role }, action, entityType, entityId, before, after, ip, userAgent, createdAt }`.
- `GET /admin/security` shape in task 5; `GET /admin/stats` shape in task 6.
- Web: `adminApi.get/post/put/del(path, body)` → typed envelope; throws `AdminApiError { code }`; step-up handled internally.

## 6. Test plan

### Unit

- Every settings schema: valid/invalid samples (GSTIN regex, threshold bounds, logoKey rejects `.svg`).
- `rbac.canSee` against the §8.1 matrix (table test generated from `Nav.config.ts` so the matrix and the nav cannot diverge).
- Last-admin demotion guard; counters window arithmetic.

### Integration

- RBAC matrix: for each admin route in this plan, STAFF and ADMIN with/without step-up → expected status (table-driven; the table is the §8.1 matrix).
- `PUT /admin/settings/gst_profile` writes audit with before/after and clears `isPlaceholder`; invalid GSTIN → 400.
- Staff: role change revokes sessions (refresh afterwards → 401); mfa-reset → next login requires enrolment; cannot demote last ADMIN → 409.
- Audit filters and pagination; `before/after` never contain `phone`/`totpSecret` (seed a write that includes them).
- Security counters increment from a failed OTP and a failed MFA; `GET /admin/security` lists the admin's own session.
- Stats: low-stock count reflects thresholds after `applyMovement`.

### Web (Vitest + Testing Library)

- `StepUpDialog` flow: 403 → dialog → success → original request retried once; failure → error shown, no infinite loop.
- Sidebar renders only permitted items for STAFF.
- `DataTable` pagination/sort emit correct query params; keyboard navigation of rows.

### E2E

- `admin-shell.spec.ts` as in task 12.

### Security

- `/admin/**` response headers carry the admin CSP (no `checkout.razorpay.com`); storefront pages carry the other.
- Direct API call to `PUT /admin/settings/:key` with a STAFF token → 403 (UI hiding is not the control).

### Coverage targets

- `modules/admin/**`, `modules/security-events/**`: 85 %; `apps/web/components/admin/**`, `lib/admin/**`: 80 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Nav matches DESIGN §8.1 exactly (reviewer compares `Nav.config.ts` to the table)
- [ ] Every mutation in this plan writes an audit row (test enumerates routes)
- [ ] Step-up works end to end in E2E; expired step-up re-prompts
- [ ] Placeholder GST profile warning visible on the dashboard until replaced
- [ ] Admin pages have no Razorpay origins in CSP; storefront unaffected

## 8. Senior engineer review notes

- Put the role matrix in one config object and generate both the nav and the RBAC tests from it; hand-written duplicates drift within a month.
- The API guard returning `403 STEP_UP_REQUIRED` (not 401) is essential so the client can distinguish "log in again" from "confirm with TOTP".
- Settings must be typed per key; a generic `Json` blob without schemas becomes an injection and correctness sink. The GSTIN placeholder flag is a business-visible reminder, not a technical detail — keep the banner.
- Do not build a generic CRUD framework for the admin; `DataTable` + per-page queries is enough for this size.
- Session revocation on role change closes the classic "promoted-then-demoted still has an ADMIN token" hole — the 15-min access token still lives until expiry; document that and keep access TTL short.
- Admin styling: dense and utilitarian is correct here; resist applying the storefront's editorial spacing.

## 9. Implementation prompt

```
You are implementing plan P05 from docs/plans/05-admin-shell-rbac-audit-staff-settings.md. Read docs/plans/00-README.md (R13) and DESIGN.md §3 WF-14, §8.1 (menu and role matrix — this is the spec for the nav and the RBAC tests), §9 Admin (Staff, Governance, Settings), §11.3 "Admin hardening". P01–P04 are merged: use the P03 guards (requireAudience('admin'), requireRole, requireMfaEnrolled, requireStepUp → 403 STEP_UP_REQUIRED), the BFF, audit.record from P04, revalidation and the test harness.

Deliver: settings API with a Zod schema per key (announcement_bar, promo_popup, free_shipping_threshold, brand, gst_profile with isPlaceholder, pickup_location, return_window_days, courier_preferences) and step-up on PUT; staff routes (list, role change with last-admin guard and session revocation, mfa-reset, revoke-sessions); audit read API with filters; security counters in Valkey (failed OTP/MFA, webhook signature failures) and GET /admin/security; GET /admin/stats; the admin layout with role-aware sidebar generated from a single Nav.config.ts, StepUpProvider/StepUpDialog that transparently handles 403 STEP_UP_REQUIRED, shared components (DataTable, FormField, ConfirmDialog, Toast, PageHeader, EmptyState, MaskedValue), pages for dashboard (with GST-placeholder banner), settings, staff, audit, security; and the CSP split (admin CSP without Razorpay origins) in middleware.

Work test-first from P05 §6: a table-driven RBAC integration test generated from Nav.config.ts covering every route in this plan for STAFF/ADMIN with and without step-up; settings schema unit tests; staff behaviours; audit redaction; counters; web tests for StepUpDialog retry-once and sidebar visibility; the admin-shell Playwright spec.

Constraints: immutable data, files ≤ 400 lines, tokens-only styling (utilitarian, dense), every mutation audited, UI hiding is never the enforcement point, .strict() Zod everywhere.

When done: run all suites and the admin-shell E2E on the compose stack, then complete the P05 Definition of Done with evidence and stop for review.
```
