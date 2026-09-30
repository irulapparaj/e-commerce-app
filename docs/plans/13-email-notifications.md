# P13 — Email notifications (templates, suppression, jobs)

|                  |                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                   |
| Estimated effort | 3 dev-days                                                                                                             |
| Depends on       | P01 (`EmailPort`), P02 (`EmailSuppression`) · P03's OTP send switches to this template system                          |
| Unblocks         | P12, P14, P15                                                                                                          |
| Design refs      | DESIGN.md §3 WF-11/13, §7 EmailSuppression, §9 Webhooks (`/webhooks/email`), §11.2 (Email), §11.3 (Email), §4.2 rule 3 |
| Branch           | `feat/p13-email`                                                                                                       |

## 1. Goal

One notification module that every other plan calls: typed templates rendered to HTML + text with the brand header/footer, a send job with retries and de-duplication, suppression-list enforcement, signed unsubscribe tokens, a feedback-webhook adapter seam for Phase 2, and a development preview route. Email is the only customer channel in V1, so it must be reliable and testable.

## 2. Scope

### In

- `modules/notifications`: `sendTemplate(name, to, data, { locale:'en', dedupeKey })` → pg-boss `email.send` job → render → suppression check → `EmailPort.send`
- Templates (react-email): `otp`, `staff-invite`, `mfa-reenrol`, `order-confirmation`, `order-cancelled`, `order-dispatched`, `order-delivered`, `data-export-ready`, `account-deleted`; layout with brand name/tagline from settings, plaintext alternative
- Subject rules (fixed strings + order number only), escaping guarantees, header-injection guards
- `EmailSuppression` enforcement; `POST /webhooks/email` with `EmailFeedbackAdapter` (`NoopFeedbackAdapter` now; SES/SNS adapter in P19); manual suppression admin route
- Signed unsubscribe token utility (used by P24 newsletter) and `GET /newsletter/unsubscribe?token=` route stub that only records suppression
- Dev preview `/dev/emails/[template]` in the web app (development only) and template snapshot tests

### Out

- Newsletter campaigns (P24), WhatsApp/SMS (P28), Hindi/Tamil templates (P27), SES domain setup (P19)

## 3. Deliverables

```
apps/api/src/modules/notifications/{index.ts, send.job.ts, render.ts, subjects.ts, suppression.ts, unsubscribe-token.ts, feedback.routes.ts, feedback.port.ts, adapters/noop-feedback.ts}
apps/api/src/modules/notifications/templates/{Layout.tsx, Otp.tsx, StaffInvite.tsx, MfaReenrol.tsx, OrderConfirmation.tsx, OrderCancelled.tsx, OrderDispatched.tsx, OrderDelivered.tsx, DataExportReady.tsx, AccountDeleted.tsx, index.ts}
apps/api/src/modules/notifications/fixtures/*.ts          # sample data per template (also used by the preview)
apps/web/app/[locale]/dev/emails/[template]/page.tsx     # development only; proxies to an API preview route
apps/api/src/modules/notifications/preview.routes.ts     # GET /dev/emails/:template (development only)
apps/api/test/{unit,int}/notifications/*.test.ts
```

## 4. Tasks (ordered)

1. **Template registry.** `templates/index.ts`: `TEMPLATES = { otp: { component, schema: z.object({ code: z.string().length(6), expiresMinutes }) , subject: () => 'Your sign-in code' }, order-confirmation: { schema: { orderNumber, items[], totals, address, locale }, subject: d => `Order ${d.orderNumber} confirmed` }, … }`. Every template has a Zod data schema (`.strict()`); `render(name, data)` validates first. Subjects are fixed strings with at most the order number interpolated — never names or free text.
2. **Layout.** `Layout.tsx`: brand name/tagline (from `SiteSetting.brand`), quiet single-column design consistent with §16 (system font stack for email, one accent for the button), footer with legal name/address placeholders from `gst_profile`, "Why am I receiving this" line, unsubscribe link only for marketing templates (none in Phase 1). All dynamic text passes through React escaping; no `dangerouslySetInnerHTML`.
3. **Render.** `render.ts`: react-email `render()` → HTML and `renderPlainText()`; inline critical CSS; images only from `MEDIA_PUBLIC_BASE_URL` or none (OTP/order mails carry no remote images to avoid tracking concerns); links point to `WEB_ORIGIN/account/...` (login-gated) — never tokens except the signed unsubscribe.
4. **Send job.** `sendTemplate()` enqueues `email.send { name, to, data, locale, dedupeKey }` with pg-boss `singletonKey = dedupeKey` (e.g. `order-confirmation:{orderId}`) and 3 retries (30 s, 5 min, 30 min). Handler: validate, check suppression (`isSuppressed(emailHash)`: hard bounce or complaint → skip with log `email.suppressed`; `UNSUBSCRIBE` only blocks marketing templates), render, `EmailPort.send({ to, subject, html, text, headers: { 'X-Entity-Ref-ID': dedupeKey } })`, log `email.sent` with template + hashed recipient + messageId. Header-injection guard: reject `to`/`subject` containing `\r` or `\n`.
5. **OTP switch.** Replace P03's minimal OTP mail with `sendTemplate('otp', …)` but **synchronously** (OTP must not wait on the job queue): expose `sendNow(name, to, data)` used only by `otp`, `staff-invite`, `mfa-reenrol`; everything else goes through the job.
6. **Suppression.** `suppression.ts`: `add({ emailHash, reason })`, `isSuppressed()`, admin route `POST /admin/email/suppress { email, reason }` (ADMIN) and `DELETE` (ADMIN ⚡, audited) for manual handling; surfaced counts on `/admin/security` (P05 counters + a query).
7. **Feedback webhook seam.** `feedback.port.ts`: `EmailFeedbackAdapter.parse(request) → { events: [{ emailHash, type:'BOUNCE'|'COMPLAINT', hard: boolean }] } | null` with signature verification inside the adapter; `POST /webhooks/email` calls the configured adapter (`EMAIL_FEEDBACK_ADAPTER=noop`), stores `WebhookEvent { provider: EMAIL }`, adds suppressions for hard bounces and complaints. Noop adapter rejects everything with 404 so the route is inert until P19.
8. **Unsubscribe token.** `unsubscribe-token.ts`: HMAC-signed `{ emailHash, purpose:'newsletter', exp }` base64url; `verify()` timing-safe; `GET /newsletter/unsubscribe?token=` → adds `UNSUBSCRIBE` suppression and renders a minimal confirmation page (web route) — P24 links to it.
9. **Preview.** `GET /dev/emails/:template?locale=en` (API, `NODE_ENV=development` only) renders with fixture data; web page iframes the HTML and shows the text version and subject. Not registered in production (boot assertion like the payment stub).
10. **Hooks wiring.** Subscribe to `hooks.onOrderPaid` → `order-confirmation`, `hooks.onOrderCancelled` → `order-cancelled` (P12 emits), `hooks.onOrderDispatched/Delivered` (P14 emits) → respective templates; `hooks.onDataExportReady` (P08) → `data-export-ready`; `hooks.onAccountDeleted` (P15) → `account-deleted`.

## 5. Contracts

- `sendTemplate<N extends TemplateName>(name, to, data: TemplateData[N], opts: { locale?: 'en', dedupeKey: string }) → Promise<{ jobId }>`; `sendNow(...)` → `{ messageId }`.
- Job name `email.send`; singleton on `dedupeKey`; retry policy fixed.
- Suppression semantics: `BOUNCE(hard)` and `COMPLAINT` block all mail; `UNSUBSCRIBE` blocks marketing only (none in Phase 1).
- Feedback adapter interface as in task 7; `WebhookEvent.provider = EMAIL`.
- Unsubscribe token: 30-day expiry, purpose-bound.

## 6. Test plan

### Unit

- Every template: renders with its fixture (snapshot HTML and text — reviewed on change); schema rejects missing/extra fields; a `name` containing `<script>alert(1)</script>` appears escaped in HTML and verbatim in text; no template output contains `WEB_ORIGIN/…?token=` except the unsubscribe template (none yet — assert the rule via a helper test).
- Subjects: table of every template → subject string; property: subject never contains any value from `data` other than `orderNumber`.
- Header-injection guard: `to: "a@b.com\r\nBcc: x@y"` rejected.
- Unsubscribe token: sign/verify, expiry, purpose mismatch, tampering.

### Integration (Mailpit + Postgres)

- `sendTemplate('order-confirmation')` → job → Mailpit has the message with the right subject, HTML and text parts, `X-Entity-Ref-ID` header; two enqueues with the same `dedupeKey` → one message.
- Suppressed address (hard bounce) → job completes without sending; log line present; `UNSUBSCRIBE` suppression does not block `order-confirmation`.
- `sendNow('otp')` delivers synchronously; P03 integration tests still pass unchanged.
- Feedback webhook with noop adapter → 404 and no suppression; a `FakeFeedbackAdapter` in tests → hard bounce adds suppression, soft bounce does not, complaint adds; duplicate provider event id → no double insert.
- Admin suppress/unsuppress routes: RBAC + audit on delete.
- Preview route absent when app is built with `NODE_ENV=production` (boot test) and present in development.

### E2E

- Covered by P12/P14/P15 specs reading Mailpit (confirmation, dispatch, delivered mails asserted there).

### Security

- No remote images in transactional templates (assert `<img` absent or only `MEDIA_PUBLIC_BASE_URL`); all links `https` to `WEB_ORIGIN`; no tokens in links.

### Coverage targets

- `modules/notifications/**`: 90 %.

## 7. Definition of Done

Global DoD plus:

- [ ] All nine templates with fixtures, schemas, snapshots and preview
- [ ] Dedupe and retry proven; suppression enforced with the marketing/transactional distinction
- [ ] Feedback webhook seam in place with the noop adapter and a fake-adapter test
- [ ] P03 OTP uses `sendNow('otp')`; no other synchronous sends
- [ ] Subjects contain no user-supplied text (property test)

## 8. Senior engineer review notes

- Transactional mail must be synchronous only where latency matters (OTP, invites); everything else goes through the queue so a slow SMTP relay cannot slow checkout.
- `singletonKey` on the job is the cheapest correct de-duplication; do not add an email log table in Phase 1 — Mailpit locally and SES logs in production are enough.
- Fixed subjects are a phishing control: if a customer's name could appear in a subject, an attacker who controls their name controls the subject.
- Keep templates image-free; deliverability improves and there is nothing to host until Phase 2.
- The feedback adapter seam exists so P19 can plug SES/SNS in without touching notification logic; resist implementing SNS signature verification now — it needs real certificates and belongs with the deployment work.
- Locale is a parameter from day one (`en` only) so P27 adds `hi`/`ta` templates without changing call sites.

## 9. Implementation prompt

```
You are implementing plan P13 from docs/plans/13-email-notifications.md. Read DESIGN.md §3 WF-11/13, §7 EmailSuppression, §9 Webhooks (/webhooks/email), §11.2 and §11.3 "Email", §4.2 rule 3 first. P01–P03 are merged: use EmailPort (SMTP→Mailpit), pg-boss, WebhookEvent, hooks, audit.record, the P05 admin guards if present, and keep P03's OTP behaviour by switching it to sendNow('otp').

Deliver: the template registry with per-template Zod schemas and fixed subjects, react-email templates (otp, staff-invite, mfa-reenrol, order-confirmation, order-cancelled, order-dispatched, order-delivered, data-export-ready, account-deleted) on a brand Layout with HTML + plaintext rendering and no remote images, sendTemplate() enqueuing a de-duplicated retrying email.send job that enforces suppression before EmailPort.send, sendNow() for latency-critical templates, header-injection guards, suppression add/check + admin suppress/unsuppress routes, the /webhooks/email route with an EmailFeedbackAdapter port and NoopFeedbackAdapter, the signed unsubscribe token utility and unsubscribe route, hook subscriptions (onOrderPaid/Cancelled/Dispatched/Delivered, onDataExportReady, onAccountDeleted), and development-only preview routes (API + web).

Work test-first from P13 §6: template snapshot/escaping/schema tests, subject property test, header-injection and token tests; integration tests against Mailpit for delivery, dedupe, suppression semantics, sendNow, feedback adapter behaviours with a FakeFeedbackAdapter, admin routes, and the production-absence boot check for preview routes.

Constraints: no dangerouslySetInnerHTML in templates, subjects never contain user data except the order number, no tokens in links other than unsubscribe, immutable data, files ≤ 400 lines, locale parameter present but only 'en' implemented.

When done: run all suites, show the preview page for order-confirmation, complete the P13 Definition of Done with evidence, and stop for review.
```
