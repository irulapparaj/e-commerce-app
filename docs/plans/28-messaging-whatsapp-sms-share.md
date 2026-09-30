# P28 — Messaging: WhatsApp, SMS OTP fallback, share row

|                  |                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 5 — Deferred messaging & sharing                                                                                                        |
| Estimated effort | 4 dev-days (+ Meta template approval and DLT registration lead time)                                                                    |
| Depends on       | P27 (localised templates), P15 (account preferences), P13 (notification module)                                                         |
| Unblocks         | —                                                                                                                                       |
| Design refs      | DESIGN.md §3 WF-16, §6.3 (WhatsApp/MSG91 costs), §10 (Legal: WhatsApp opt-in, DLT), §11.5 (Phase 5 gate), §14 Phase 5, §2.4 (share row) |
| Branch           | `feat/p28-messaging`                                                                                                                    |

## 1. Goal

Add WhatsApp order notifications and support, an SMS fallback for OTP, and the product share row — each behind explicit consent, processor review, and the existing notification and security controls, without introducing third-party scripts to the storefront.

## 2. Scope

### In

- Consent: `User.channelPrefs { whatsapp: { optedIn, at, number } }`, account preferences UI, opt-in checkbox at checkout (unchecked), one-tap opt-out, audit of consent changes
- `MessagingPort` with `WhatsAppCloudAdapter` (Meta Cloud API; approved templates: `order_confirmed`, `order_dispatched` with tracking, `order_delivered`, `return_update`) and delivery-status webhook; `SmsPort` with `Msg91Adapter` (DLT template ids in settings) for OTP fallback
- OTP fallback rules: email suppressed/hard-bounced or user taps "Send by SMS" (rate-limited, same attempts/nonce model)
- WhatsApp support: click-to-chat link/widget (`wa.me` link, no SDK)
- PDP "Share now" row: X, Pinterest, Email, Web Share API (when available), Facebook, WhatsApp, LinkedIn — plain intent URLs, `rel="noopener noreferrer"`, `target=_blank`, no third-party scripts or pixels; CSP unchanged
- Processor review checklist (Meta, MSG91) under DPDP; privacy notice update; cost dashboard counters

### Out

- WhatsApp marketing broadcasts, chatbots, SMS marketing

## 3. Deliverables

```
apps/api/src/ports/{messaging.ts, sms.ts}  apps/api/src/ports/adapters/{whatsapp-cloud.ts, msg91-sms.ts, fake-messaging.ts, fake-sms.ts}
apps/api/src/modules/notifications/{channels.ts, whatsapp.templates.ts, sms-otp.ts, webhook.whatsapp.routes.ts}
apps/api/prisma/migrations/* (User.channelPrefs, MessageLog)
apps/web/components/{account/ChannelPreferences, checkout/WhatsAppOptIn, catalogue/ShareRow, layout/WhatsAppSupport}.tsx
docs/privacy/{processor-review-meta.md, processor-review-msg91.md}  apps/web/content/policies/*/privacy.mdx (updated)
tests/fixtures/{whatsapp,msg91}/*.json  apps/api/test/int/messaging/*.test.ts  tests/e2e/messaging.spec.ts
```

## 4. Tasks (ordered)

1. Consent model + UI (account, checkout); audit; export/erase include prefs (P08 services).
2. `MessagingPort`/`SmsPort` interfaces with fake adapters (used in tests/E2E); adapters with typed responses; secrets in the store; per-message `MessageLog { channel, template, toHash, providerId, status, cost }`.
3. Channel routing in notifications: for order events, email always; WhatsApp only when `optedIn` and template approved; failures never block email; delivery webhook updates `MessageLog` (signature verified per Meta docs).
4. SMS OTP fallback: `POST /auth/send-otp { channel:'sms' }` allowed only when a phone is on file and (email suppressed or explicit request); DLT template; same nonce/attempt/rate rules; generic responses preserved.
5. Share row and support link; E2E; CSP unchanged (test).
6. Processor reviews and privacy notice; cost counters on the dashboard.

## 5. Contracts

- No WhatsApp/SMS without `optedIn=true` (server-enforced; tests).
- Share URLs built from a fixed template map with URL-encoded product URL/title only.
- Webhook: Meta signature (`X-Hub-Signature-256`) timing-safe; MSG91 callbacks with shared secret.

## 6. Test plan

- **Unit:** channel routing table; share URL builder (encoding, allow-list); template payload builders.
- **Integration (fake adapters + msw for webhooks):** opted-out user gets email only; opted-in gets both; WhatsApp failure does not affect email; delivery webhook updates the log; SMS OTP fallback rules and rate limits; consent audit; export includes prefs.
- **E2E:** customer opts in at checkout → order → fake WhatsApp message logged; share row links correct; CSP has no new origins; toggling opt-out stops messages.
- **Security:** webhook signature tests; no third-party scripts; phone never in logs.
- **Coverage:** modules 90 %.

## 7. Definition of Done

- [ ] Consent enforced server-side; audit + export/erase coverage
- [ ] Email unaffected by messaging failures; delivery status tracked
- [ ] Share row without scripts; CSP unchanged
- [ ] Processor reviews and privacy notice merged; DLT/Meta approvals recorded

## 8. Senior engineer review notes

- Provider approvals (Meta templates, DLT) take weeks; start them before writing code.
- Email remains the system of record for notifications; WhatsApp is additive and must never gate order flow.
- The share row is deliberately dumb links — SDK buttons are tracking pixels with extra steps.

## 9. Implementation prompt

```
You are implementing plan P28 from docs/plans/28-messaging-whatsapp-sms-share.md. Read DESIGN.md §3 WF-16, §10 Legal (WhatsApp opt-in, DLT), §11.5 Phase 5 gate, §14 Phase 5 and §2.4. P13, P15 and P27 are merged. Confirm Meta template approval and DLT registration status before wiring live adapters; use the fake adapters until then.

Deliver: channel consent model and UI with audit, MessagingPort/SmsPort with fake and live adapters and a MessageLog, channel routing that keeps email authoritative and adds WhatsApp only for opted-in users, Meta delivery webhook with signature verification, SMS OTP fallback under the existing OTP rules, the wa.me support link, the PDP share row as plain intent links with CSP unchanged, processor-review docs and the privacy notice update, and cost counters.

Work test-first from P28 §6, then the messaging Playwright spec with fake adapters.

Constraints: no messages without server-verified consent, no third-party scripts, phone numbers never logged, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P28 Definition of Done with evidence, and stop for review.
```
