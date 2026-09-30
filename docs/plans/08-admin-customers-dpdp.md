# P08 — Admin customers & DPDP

|                  |                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                        |
| Estimated effort | 3 dev-days                                                                                                                                                  |
| Depends on       | P05 (admin shell), P03 (`isDisabled`, sessions)                                                                                                             |
| Unblocks         | P15 (self-service export/erase reuse the services here)                                                                                                     |
| Design refs      | DESIGN.md §8.1 Customers row, §9 Admin Customers, §11.2 (Customer PII), §11.3 (Admin hardening — masking/reveal; Data protection — rights flows, retention) |
| Branch           | `feat/p08-admin-customers`                                                                                                                                  |

## 1. Goal

Staff can find and help customers without seeing PII by default; admins can reveal PII with a reason under step-up for a short window, disable abusive accounts, and fulfil DPDP export/erasure requests — all audited. The export/erase services are shared with the customer's own account page (P15).

## 2. Scope

### In

- API: customer search/list, masked detail, reveal (⚡, reason, 5-min token), disable/enable (⚡), DPDP export (job → file + email), DPDP erase (⚡, anonymise), sessions count/revoke; masking utilities in `packages/shared`
- Web: customers list, customer detail (masked values with Reveal, orders tab placeholder until P12, addresses masked, sessions, actions)
- `dpdp` services: `exportUserData(userId)`, `eraseUser(userId, { actor })` (used by P15)
- Retention job scaffolding: `retention` cron (deletes expired refresh tokens, expired export files; extended by later plans)

### Out

- Role changes (P05 staff), order management (P14), customer-side UI (P15), email templates (P13 — a minimal "your data export is ready" message via `EmailPort` here)

## 3. Deliverables

```
packages/shared/src/masking.ts
apps/api/src/modules/customers/{routes.ts, search.ts, detail.dto.ts, reveal.service.ts, disable.service.ts}
apps/api/src/modules/dpdp/{export.service.ts, export.job.ts, erase.service.ts, retention.job.ts}
apps/web/app/admin/customers/{page.tsx, [id]/page.tsx}
apps/web/components/admin/customers/{CustomerTable.tsx, CustomerHeader.tsx, RevealDialog.tsx, DisableDialog.tsx, DpdpActions.tsx, AddressList.tsx, SessionsTable.tsx}
apps/api/test/int/customers/*.test.ts  apps/api/test/int/dpdp/*.test.ts  tests/e2e/admin-customers.spec.ts
```

## 4. Tasks (ordered)

1. **Masking.** `masking.ts`: `maskPhone('9876543210') → '98•••••210'`, `maskEmail('irul@example.com') → 'i•••@example.com'`, `maskAddressLine(line) → '•••• ' + last word`, `maskName`. Pure, unit-tested; used by API DTOs (never by the client — the client receives masked strings).
2. **Search.** `GET /admin/customers?q=&page=` (STAFF): `q` matched as email prefix (case-insensitive), or 10-digit phone → `phoneHmac = blindIndex(q)`, or order number `PE-…` → owner (orders exist from P12; until then the branch returns empty). Result rows: id, masked email, masked phone, name (initial + surname), created, order count, `isDisabled`, `mfaEnabled` for staff accounts excluded (customers only: role CUSTOMER).
3. **Detail (masked).** `GET /admin/customers/:id` (STAFF) → `CustomerDetailDto { id, maskedEmail, maskedPhone, name, createdAt, isDisabled, locale, addresses[] (masked line1/line2/phone; city/state/pincode clear), sessions: { count, lastSeen }, orders: [] (P12 fills), returnRequests: [] (P22), flags: { deleted } }`. No unmasked field exists in this DTO type (compile-time guarantee via a `Masked<string>` brand).
4. **Reveal.** `POST /admin/customers/:id/reveal { reason: string ≥ 10 }` (ADMIN ⚡; rate limit 30/day/staff → alert counter) → audit `customer.pii.reveal` with reason → returns `{ revealToken, expiresAt }` (signed JWT aud `reveal`, 5 min, bound to customer id + actor). `GET /admin/customers/:id/pii` with `X-Reveal-Token` → unmasked `{ email, phone, addresses[] }`; every read audited `customer.pii.read`. Token expiry ends access; no refresh.
5. **Disable/enable.** `POST …/disable { reason }` (ADMIN ⚡): `isDisabled=true`, revoke all sessions, audit; OTP verify for disabled users already fails generically (P03). `POST …/enable` (ADMIN, no step-up) audits.
6. **DPDP export.** `export.service.exportUserData(userId)` → JSON `{ profile, addresses, orders (from P12 when present), reviews, wishlist, sessions (ip/ua/dates), consents }` with plaintext PII (it is the user's own data). `export.job` writes to `exports/dpdp/{userId}-{uuid}.json` (24 h expiry via `export-expire` from P07), sends email "Your data export is ready" with a presigned link (15 min) through `EmailPort`; admin route `POST …/dpdp-export` (ADMIN) enqueues + audits; P15 reuses for self-service.
7. **DPDP erase.** `erase.service.eraseUser(userId, { actor, source: 'ADMIN'|'SELF' })` in one transaction: `email → deleted+{id}@anon.invalid`, `name → 'Deleted user'`, `phone/phoneHmac → null`, delete addresses, revoke sessions, delete wishlist, anonymise review author display, remove PII from `Order.shippingAddress` snapshots (keep city/state/pincode) and `Order.email/phone → null`, set `deletedAt`, audit `customer.erased` with source. Orders/invoices retained (8 y). Route `POST …/dpdp-erase { reason }` (ADMIN ⚡). Refuse if the customer has orders in `PENDING/CONFIRMED/DISPATCHED/IN_TRANSIT` (409 `ERASE_BLOCKED_ACTIVE_ORDERS`).
8. **Retention job.** `retention.job` cron daily: delete `RefreshToken` past `expiresAt` + 7 d; delete `exports/` objects older than 24 h (shared with P07 expire — consolidate into one job here); later plans append rules (return photos 1 y, logs).
9. **UI.** `CustomerTable` (search box with hint "email, phone or order no."), detail page: `CustomerHeader` (masked contact, status chips, actions), `RevealDialog` (reason field → step-up → shows unmasked values with a 5-min countdown, then re-masks client-side and the token is gone), `AddressList` masked, `SessionsTable` with revoke, `DpdpActions` (export, erase with confirm + step-up; erase disabled with explanation when active orders exist), `DisableDialog`.
10. **E2E** `admin-customers.spec.ts`: seed a customer (via login in the test) → STAFF searches by phone → sees masked detail → ADMIN reveals with reason (step-up) → unmasked shown → after token expiry (clock or short TTL in test env) re-masked; ADMIN disables → customer OTP login fails generically; ADMIN erases → detail shows "Deleted user", audit lists reason.

## 5. Contracts

- `CustomerDetailDto` fields typed `Masked<string>`; `PiiDto { email, phone, addresses[] }` only from the `/pii` route with a reveal token.
- `POST …/reveal → { revealToken, expiresAt }`; `GET …/pii` requires header `X-Reveal-Token`; 401 `REVEAL_EXPIRED`.
- `eraseUser` result `{ erasedAt, retained: { orders: n } }`; 409 `ERASE_BLOCKED_ACTIVE_ORDERS`.
- Export JSON schema versioned `{ version: 1, generatedAt, … }`.

## 6. Test plan

### Unit

- Masking functions (short/long inputs, unicode names, empty).
- `Masked<string>` brand: a compile-time test file that fails `tsc` if an unmasked value is assigned (use `// @ts-expect-error`).
- Reveal token claims/expiry; search query classifier (email vs phone vs order number).

### Integration

- STAFF detail never contains a full phone/email (regex scan of the JSON response for 10-digit numbers and `@` before masking pattern).
- Reveal: without step-up 403; with step-up and reason → token; `/pii` returns plaintext; after expiry 401; audit rows `reveal` (with reason) and `read`; 31st reveal in a day → 429 and counter alert.
- Disable → sessions revoked (refresh 401) and OTP verify returns generic `INVALID_OTP`; enable restores.
- Erase: anonymises user/addresses/wishlist, order snapshots keep city/state/pincode but no lines/phone, `deletedAt` set, audit with source; blocked with an active order (create via `prisma` with status CONFIRMED); a DELIVERED order does not block.
- Export: JSON contains addresses in plaintext and orders; file written; email captured with a presigned link; object expires via retention job (clock).
- Search: by email prefix, by phone (blind index), by order number once P12 exists (test marked `todo` until then), excludes staff accounts.

### Web

- `RevealDialog` requires ≥ 10-char reason; countdown re-masks at zero; a second reveal needs a new reason.

### E2E

- `admin-customers.spec.ts` (task 10).

### Security

- IDOR: customer id of a staff account via customer routes → 404 (customers only).
- Reveal token for customer A rejected on customer B's `/pii`.

### Coverage targets

- `modules/customers/**`, `modules/dpdp/**`, `packages/shared/src/masking.ts`: 90 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Masked DTO cannot carry unmasked values (type test) and integration regex scan passes
- [ ] Reveal is step-up + reason + audited + time-boxed; read events audited
- [ ] Erase keeps financial records, removes PII from snapshots, blocked by active orders
- [ ] Retention job scheduled with the export-expiry rule
- [ ] Services exported for P15 reuse with `source: 'SELF'`

## 8. Senior engineer review notes

- The `Masked<string>` brand is cheap and catches the most likely regression (someone adding `phone` to the detail DTO). Keep it.
- Reveal tokens must be bound to _both_ customer and actor; a shared token would let one staff member's reveal be replayed by another.
- Erasure must not delete `Order` rows — GST retention is a legal requirement; anonymise instead and test that totals still sum in reports later.
- The "active orders block erasure" rule protects the customer (they would lose tracking/refund ability) as much as the business. Surface the reason in the UI.
- Consolidating expiry/retention into one daily job now avoids three half-duplicated crons later.
- Search by hashed email is impossible by design; email prefix search on the plaintext column is acceptable because email is the login identifier and is not field-encrypted (documented in DESIGN §7).

## 9. Implementation prompt

```
You are implementing plan P08 from docs/plans/08-admin-customers-dpdp.md. Read DESIGN.md §8.1 Customers row, §9 Admin Customers, §11.2 "Customer PII" and §11.3 "Admin hardening" (masking, reveal) and "Data protection" (rights flows, retention) first. P01–P07 are merged: use the P03 guards/sessions and blindIndex, the encryption-aware Prisma client, audit.record, security counters and rate limits, ObjectStoragePort, EmailPort, pg-boss, and the P05 admin shell (StepUpProvider, MaskedValue, DataTable).

Deliver: masking utilities in packages/shared with a Masked<string> brand; customer search (email prefix, phone via blind index, order number branch), masked detail DTO, reveal flow (ADMIN step-up, reason ≥ 10 chars, 30/day limit with alert counter, 5-min reveal JWT bound to customer + actor, /pii route with audited reads), disable/enable with session revocation, DPDP export service + job (JSON to exports/dpdp/, email with 15-min presigned link) and erase service (anonymise user/addresses/wishlist/review author, scrub order snapshots but retain orders, deletedAt, blocked by active orders) both exported for P15 with a source parameter, a daily retention job consolidating export expiry and expired-token cleanup, and the admin customers pages/components (table, header, RevealDialog with countdown re-masking, AddressList, SessionsTable, DpdpActions, DisableDialog).

Work test-first from P08 §6: masking unit tests and the compile-time Masked brand test; integration tests that regex-scan STAFF responses for leaked PII, reveal lifecycle and limits, disable → generic OTP failure, erase behaviour and active-order block, export contents and expiry; the admin-customers Playwright spec.

Constraints: immutable data, files ≤ 400 lines, no unmasked field in any STAFF-visible DTO, orders never deleted, every action audited with reason where specified.

When done: run all suites and the E2E, complete the P08 Definition of Done with evidence, and stop for review.
```
