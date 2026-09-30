# P15 — Customer account

|                  |                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                           |
| Estimated effort | 3 dev-days                                                                                                     |
| Depends on       | P12 (orders, addresses API), P14 (tracking), P08 (DPDP services), P03 (sessions)                               |
| Unblocks         | P18                                                                                                            |
| Design refs      | DESIGN.md §3 WF-06/11, §8 (account rows), §9 Account, §11.3 (Authorisation; Data protection rights flows), §16 |
| Branch           | `feat/p15-customer-account`                                                                                    |

## 1. Goal

Logged-in customers can see their orders and track them, manage addresses, review their sessions, export their data and delete their account — every page session-scoped, styled with the design system, and the login page finally designed rather than functional.

## 2. Scope

### In

- API: `POST /auth/reauth` (fresh OTP → 5-min `amr: ['reauth']` claim for customers, used as step-up for delete/export), `GET /account/sessions` / `DELETE …/:id` (exist from P03 — UI here), `POST /account/export` (P08 service, source SELF), `DELETE /account` (P08 erase, source SELF, reauth required), `PATCH /account/profile { name, phone }`
- Web: `/account` (overview), `/account/orders`, `/account/orders/[id]` (items, totals with tax split, timeline, tracking link, "Need help?" → contact), `/account/addresses` (CRUD UI on P12 API), `/account/security` (sessions, log out everywhere, export, delete), `/login` and `/admin/login` restyled, post-login redirect preserved from email links
- Empty states, skeletons, mobile layout

### Out

- Returns UI (P22 adds the entry point), wishlist page (P21), invoice download (P26), email preferences (P28)

## 3. Deliverables

```
apps/api/src/modules/account/{routes.ts, profile.service.ts, reauth.ts}
apps/web/app/[locale]/account/{layout.tsx, page.tsx, orders/page.tsx, orders/[id]/page.tsx, addresses/page.tsx, security/page.tsx}
apps/web/app/[locale]/login/page.tsx (restyled)  apps/web/app/admin/login/page.tsx (restyled)
apps/web/components/account/{AccountNav, OrderList, OrderCard, OrderDetail, OrderTimeline, TrackingLink, AddressList, AddressForm (reuse checkout), SessionsList, ExportDataCard, DeleteAccountDialog, ReauthDialog, ProfileForm}.tsx
apps/web/components/auth/{OtpForm, LoginCard, TotpForm}.tsx
apps/api/test/int/account/*.test.ts  apps/web/components/account/*.test.tsx  tests/e2e/account.spec.ts
```

## 4. Tasks (ordered)

1. **Reauth.** `POST /auth/reauth/send` (sends OTP to the session's email; rate-limited as OTP) and `POST /auth/reauth/verify { nonce, otp }` → new access token with `amr: ['reauth']`, `stepUpExp` 5 min (reuses P03 OTP + step-up machinery); guard `requireReauth` = `requireStepUp` accepting `reauth` for customers. BFF route `/api/auth/reauth/*` rotates the access cookie.
2. **Account API.** `PATCH /account/profile` (name ≤ 80, phone regex; updates blind index via the extension), `POST /account/export` (reauth) → `dpdp.exportUserData` job with `source: 'SELF'`, 1 per 24 h; `DELETE /account` (reauth) → `dpdp.eraseUser` (blocked by active orders → 409 with the list), revokes sessions, emits `hooks.onAccountDeleted` (P13 mail), BFF clears cookies.
3. **Order read DTOs** already exist (P12/P14); add `tracking: { awb, courier, url }` and `canRequestReturn: false` placeholder (P22 flips) to `GET /orders/:id`.
4. **Pages.** `AccountNav` (Overview, Orders, Addresses, Security; mobile tabs); overview (name, recent 3 orders, default address, quick links); orders list (paged, status chip, total, date, `OrderCard`); order detail (`OrderDetail` with items + tax split "Includes CGST/SGST" or "IGST", `OrderTimeline` from status events in IST, `TrackingLink` opens the allow-listed URL in a new tab with `rel="noopener noreferrer"`, address, payment status, "Contact us" link with order number prefilled); addresses (list with default badge, add/edit via the checkout `AddressForm`, delete with confirm, max 10 message); security (`SessionsList` with current-session marker and per-row revoke, "Log out everywhere", `ExportDataCard` → `ReauthDialog` → request → "We'll email a link", `DeleteAccountDialog` → reauth → consequences copy → delete → redirect home with toast); `ProfileForm` on overview.
5. **Login restyle.** `LoginCard` (wordmark, email → `OtpForm` six-box input with paste support, resend with 30 s countdown, generic errors), `/admin/login` adds `TotpForm` and the enrolment screen (QR + recovery codes download as text on screen — no file download inside artifacts constraints do not apply here; use a "Copy codes" button). Both under §16 tokens; a11y: labelled inputs, focus order, `aria-live` errors.
6. **Redirect preservation.** Email links `/account/orders/{id}` → middleware → `/login?redirect=/account/orders/{id}` → after OTP the BFF redirects to the validated path (P03 validator).
7. **E2E** `account.spec.ts`: customer from the P12/P14 flows logs in via an email deep link → lands on the order detail → sees DISPATCHED with a tracking link (fake AWB) → adds a second address and sets default → revokes another session (create one via API) → requests export (Mailpit receives "export ready") → deletes account after the order is DELIVERED (webhook fixture) → OTP login afterwards behaves as a new account (no orders), audit shows erase with `SELF`.

## 5. Contracts

- `POST /auth/reauth/verify → { accessToken }` with `amr:['reauth']`; guards accept `step-up` (admin TOTP) or `reauth` (customer OTP) per route.
- `DELETE /account` 204; 409 `ERASE_BLOCKED_ACTIVE_ORDERS { orderNumbers[] }`; 403 `REAUTH_REQUIRED`.
- `POST /account/export` 202; 429 `EXPORT_RATE_LIMITED` (1/24 h).
- `GET /orders/:id.tracking.url` is `null` or an allow-listed `https` URL.

## 6. Test plan

### Unit

- `OrderTimeline` formats events in IST with the right labels; `TrackingLink` renders nothing for `null`.
- `OtpForm`: paste of 6 digits fills boxes; backspace navigation; resend countdown.
- `DeleteAccountDialog` requires typed confirmation ("DELETE") and reauth.

### Integration

- Reauth: send/verify issues `amr:['reauth']`; expired → 403 `REAUTH_REQUIRED` on delete/export; admin `step-up` token also accepted on customer routes? (No — audience `storefront` only; test that an admin token is rejected on `/account/*` and vice versa.)
- Export: 202 → job → email; second within 24 h → 429.
- Delete: blocked with a CONFIRMED order; allowed after DELIVERED; erases (reuse P08 assertions), revokes sessions (refresh → 401), audit `SELF`.
- Profile: phone update rotates `phoneHmac`; invalid phone → 400.
- IDOR sweep: every `/account/*` and `/orders/*` route with another user's ids → 404.

### Web

- Pages render with msw fixtures; account nav active state; addresses max-10 message.

### E2E

- `account.spec.ts` (task 7).

### Security

- Redirect after login validated (`//evil` ignored) — reuse P03 E2E case from the account entry point.
- Tracking links `rel="noopener noreferrer"`, `https` only.

### Coverage targets

- `modules/account/**`: 90 %; `components/account/**`, `components/auth/**`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] All account routes scoped; IDOR sweep test passes
- [ ] Reauth gates export/delete; admin and customer tokens not interchangeable
- [ ] Login pages meet §16 and axe; OTP paste works on mobile Safari (manual check noted)
- [ ] E2E covers deep link → login → order → tracking → export → delete

## 8. Senior engineer review notes

- Customers have no TOTP, so "step-up" for them is a fresh OTP; reuse the P03 machinery rather than inventing a second flow. The guard should accept an `amr` set per route, not a boolean.
- Deletion must clear cookies via the BFF and revoke server sessions; test both, one without the other leaves a usable session.
- Keep the account area server-rendered with small client islands (forms, dialogs); it needs no ISR and must never be cached — set `dynamic = 'force-dynamic'` and `Cache-Control: private, no-store` on these routes.
- The order detail page is the landing page for most transactional emails; measure its LCP too, not just the storefront.
- Address form reuse from checkout avoids two validation implementations drifting.

## 9. Implementation prompt

```
You are implementing plan P15 from docs/plans/15-customer-account.md. Read DESIGN.md §3 WF-06/11, §8 account rows, §9 Account, §11.3 Authorisation and Data protection rights flows, §16, and docs/plans/00-README.md (R11). P03, P08, P12, P13 and P14 are merged: use the OTP/step-up machinery, dpdp export/erase services with source SELF, orders and addresses APIs, tracking URL builder, hooks, the BFF and the P09 components.

Deliver: customer reauth (OTP-based amr:['reauth'] with 5-min expiry and a guard that accepts a configured amr set per route), account API (profile update, export with 1/24h limit, delete with active-order block and cookie/session teardown), tracking and canRequestReturn fields on the order detail DTO, the account pages (overview, orders list, order detail with IST timeline and allow-listed tracking link, addresses reusing the checkout AddressForm, security with sessions/log-out-everywhere/export/delete dialogs, profile form) rendered dynamically with private no-store caching, restyled /login and /admin/login (six-box OTP input with paste, resend countdown, TOTP and enrolment screens) under §16, and redirect preservation from email deep links.

Work test-first from P15 §6: reauth and audience-separation integration tests, export/delete behaviours, IDOR sweep across all account and order routes, component tests for OtpForm/Timeline/DeleteAccountDialog, page render tests with msw; then the account Playwright spec (deep link → login → order → tracking → address → sessions → export → delete).

Constraints: every account query scoped by userId, no caching of account pages, tracking links only from the allow-list with noopener, immutable data, files ≤ 400 lines, strings via next-intl, tokens-only styling.

When done: run all suites and the E2E on compose, complete the P15 Definition of Done with evidence, and stop for review.
```
