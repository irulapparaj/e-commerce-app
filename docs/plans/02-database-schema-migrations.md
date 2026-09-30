# P02 — Database schema, migrations, seed, test harness

|                  |                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                |
| Estimated effort | 3 dev-days                                                                                          |
| Depends on       | P01                                                                                                 |
| Unblocks         | P03–P08, P10–P15                                                                                    |
| Design refs      | DESIGN.md §7 (all models), §9 (orderNumber), §11.3 (encryption, append-only audit), R2, R6, R7, R17 |
| Branch           | `feat/p02-database`                                                                                 |

## 1. Goal

Every §7 model exists as a Prisma model with migrations that also create the objects Prisma cannot express (generated `tsvector`, trigram indexes, check constraints, append-only triggers, per-year order-number sequences). Field-level encryption and blind indexes are transparent through a Prisma extension. A seed loads the §2.2 taxonomy and sample products. Integration tests have a shared, fast harness.

## 2. Scope

### In

- `apps/api/prisma/schema.prisma` for: User, RefreshToken, Address, Category, Product, ProductVariant, ProductImage, StockMovement, ImportJob, Order, OrderItem, OrderStatusEvent, ReturnRequest, WebhookEvent, AuditLog, Review, WishlistItem, Coupon, BlogPost, SiteSetting, EmailSuppression (enums included)
- Raw SQL migrations for generated columns, GIN indexes, check constraints, triggers, sequences, DB roles
- Prisma client with encryption extension (R6) and `forUser` scoping helpers
- `inventory.apply()` primitive (R7) — the only writer of `variant.stock`
- Seed script; `resetDb()` and container harness for integration tests; `prisma migrate diff` drift check in CI

### Out

- `ProductTranslation`/`CategoryTranslation` (Phase 4, plan 27); business logic beyond the primitives above

## 3. Deliverables

```
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/*  (Prisma-generated + hand-written SQL steps)
apps/api/prisma/seed.ts  apps/api/prisma/seed-data/{categories.json, products.json}
apps/api/src/db/{prisma.ts, encryption-extension.ts, encrypted-fields.ts, scoping.ts, order-number.ts}
apps/api/src/modules/inventory/apply-movement.ts
apps/api/test/helpers/{db.ts}  (uses containers.ts from P01)
.github/workflows/ci.yml  (+ migrate-diff step)
```

## 4. Tasks (ordered)

1. **Enums.** `Role`, `Locale {en}`, `RefreshAudience`, `OrderStatus`, `PaymentStatus`, `StockReason`, `ImportStatus`, `ImportType`, `ReturnReason`, `ReturnStatus`, `ReturnResolution`, `WebhookProvider`, `ReviewStatus`, `CouponType`, `BlogStatus`, `SuppressionReason`, `StatusSource`.
2. **Models** exactly per §7 with: `@db.Uuid` ids default `gen_random_uuid()`, `createdAt/updatedAt`, explicit `@@index` on every FK, `@@unique` on `email`, `sku` (product and variant), `slug`, `orderNumber`, `razorpayPaymentId`, `(provider, externalId)`, `(userId, variantId)`, `(orderItemId)` for reviews; money fields `Int`; `payload/before/after/description/specifications` as `Json`. `Order.userId` NOT NULL. `Coupon.stackable` default false. `SiteSetting.key` PK.
3. **Raw SQL migration steps** (append to generated migrations, never edit applied ones):
   - `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;`
   - `product.search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(name,'')),'A') || setweight(to_tsvector('english', coalesce(sku,'')),'A') || setweight(to_tsvector('simple', coalesce(array_to_string(tags,' '),'')),'B')) STORED` + GIN index; `GIN (name gin_trgm_ops)` on product and category.
   - Check constraints: `order_tax_pair` (`(cgst_amount>0 AND sgst_amount>0 AND igst_amount=0) OR (cgst_amount=0 AND sgst_amount=0 AND igst_amount>0) OR total=0`), `order_item_qty_positive`, `stock_movement_delta_nonzero`, `variant_stock_nonnegative`, `review_rating_range 1..5`, `return_photo_count 1..4`.
   - Append-only triggers on `audit_log` and `stock_movement`: `BEFORE UPDATE OR DELETE … RAISE EXCEPTION 'append_only'`.
   - Sequences `order_number_seq_2026`, `_2027` and a function `next_order_number()` returning `'PE-' || year || lpad(nextval(...)::text, 4, '0')` (creates the year's sequence on demand via `EXECUTE` if missing).
   - Roles: `app_rw` (used by the app; no `DELETE` on audit/stock tables at the grant level either), `app_migrate` (owner). Document in README; local compose uses the superuser for convenience but tests assert the triggers, not the grants.
4. **Encryption extension (R6).** `encrypted-fields.ts` declares `{ User: ['phone'], Address: ['phone','line1','line2'], Order: ['phone'] }` plus JSON path `Order.shippingAddress.{line1,line2,phone}`; `encryption-extension.ts` wraps `create/update/upsert/createMany` to encrypt and `find*` results to decrypt, and sets `phoneHmac` from `blindIndex(phone)` automatically on User and Order. Reads that select only ciphertext (e.g. exports) use a `raw` client without the extension.
5. **Scoping helpers.** `forUser(userId)` returns typed `where` fragments for Address/Order/ReturnRequest/WishlistItem/RefreshToken; repository functions in later plans must accept `userId` and use these — establish the pattern with one `findOrdersForUser` example and a lint rule note.
6. **`applyMovement({ variantId, delta, reason, referenceId?, actorId?, note? }, tx)`** in `modules/inventory`: inside the caller's transaction, `SELECT … FOR UPDATE` on the variant via `$queryRaw`, reject if `stock + delta < 0` with `INSUFFICIENT_STOCK`, insert the movement, update the cached stock, return the new stock. This is the only code path allowed to touch `variant.stock` (add a Semgrep rule `no-direct-stock-update` in plan 17).
7. **Order number.** `order-number.ts` calls `next_order_number()`; no app-side counters.
8. **Seed.** Idempotent (`upsert` by slug/sku): categories from §2.2 (top-level + children with `sortOrder`), 24 sample products across categories with 1–2 variants, HSN/GST per category defaults, placeholder image keys, one ADMIN user (`admin@example.test`, `mfaEnabled=false` so plan 03 can exercise enrolment), `SiteSetting` defaults: `announcement_bar`, `free_shipping_threshold=59900`, `brand` (placeholder), `gst_profile` (placeholder GSTIN `33AAAAA0000A1Z5`, flagged), `pickup_location` (Chennai 600001), `return_window_days=15`, `promo_popup.enabled=false`.
9. **Test harness.** `test/helpers/db.ts`: `getPrisma()` bound to the Testcontainers URL, `migrate()` (runs `prisma migrate deploy` once per global setup), `resetDb()` (TRUNCATE all app tables RESTART IDENTITY CASCADE except `_prisma_migrations`; reset sequences), `seedMinimal()` (one category, two products, one admin). Wire into `vitest.int.config.ts` from P01.
10. **CI drift check.** Step running `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url …` and failing on non-empty output (hand-written SQL objects are excluded via `--exclude` patterns or a documented allow-list).

## 5. Contracts

- `applyMovement` signature above; throws `AppError('INSUFFICIENT_STOCK', 409)`.
- `nextOrderNumber(tx) → 'PE-YYYYNNNN'`.
- Encrypted fields are plain strings to application code; ciphertext format `v1:<iv>:<tag>:<data>` base64url.
- `resetDb()` must run in < 200 ms on the seeded schema.

## 6. Test plan

### Unit

- `encrypted-fields` map covers exactly the DESIGN §7 fields (snapshot test so adding a PII field forces a conscious update).
- `order-number` formatter for year rollover input.

### Integration (Testcontainers Postgres)

- Migrations apply from empty DB; applying twice is a no-op; drift check passes.
- Unique constraints: duplicate `sku`, `slug`, `email`, `orderNumber`, `razorpayPaymentId` rejected.
- Check constraints: order with both CGST and IGST rejected; both zero with total > 0 rejected; TN-style pair accepted; quantity 0 rejected; review rating 6 rejected; return with 5 photos rejected.
- Append-only: `UPDATE audit_log` and `DELETE FROM stock_movement` raise `append_only`.
- `search_vector` populated on insert and updated on name change; trigram query `name % 'kapor'` finds "Kapur".
- `next_order_number()` under 50 concurrent calls yields 50 unique, monotonically increasing numbers.
- Encryption extension: create User with phone → row stores ciphertext (assert via raw client), `findUnique` returns plaintext, `phoneHmac` set and equals `blindIndex(phone)`; `findFirst({ where: { phoneHmac } })` finds the user; update phone rotates ciphertext and index; nested `Order.shippingAddress` JSON lines encrypted.
- `applyMovement`: reservation reduces stock and writes the ledger; over-reservation throws and leaves stock unchanged; 20 concurrent reservations of a 10-stock variant end with exactly 10 successes and `sum(delta) == -10`; ledger sum equals cached stock afterwards.
- Seed: run twice → identical counts; admin exists with role ADMIN; settings keys present.
- `resetDb()` empties tables and re-seed works.

### E2E

- None.

### Security

- Raw client (no extension) is not exported from `db/index.ts` public surface except as `prismaRaw` with a lint comment; test that `prisma.user.findUnique` never returns ciphertext.

### Coverage targets

- `apps/api/src/db/**`, `modules/inventory/**`: 95 %.

## 7. Definition of Done

Global DoD plus:

- [ ] `pnpm db:migrate && pnpm db:seed` works on a fresh compose stack
- [ ] `prisma migrate diff` step in CI is green
- [ ] Every §7 model/field present (reviewer diffs schema against DESIGN.md §7)
- [ ] Triggers, constraints, sequences and extensions have integration tests
- [ ] No code outside `applyMovement` writes `variant.stock`

## 8. Senior engineer review notes

- Generated columns and triggers live in hand-written SQL inside Prisma migration folders; Prisma's `migrate diff` will flag them unless excluded — decide the exclusion list now and document it, or drift checks become noise nobody reads.
- Do not model `Cart` in Postgres; it is Valkey-only by design (plan 11).
- `Order.shippingAddress` JSON encryption is the fiddliest part; keep the JSON-path list explicit and tested rather than encrypting the whole blob (admins need city/state/pincode in clear for fulfilment).
- The per-year sequence avoids the classic "max(orderNumber)+1" race. Do not replace it with an application counter, ever.
- Seed data is also the E2E fixture; keep product names realistic (from the reference site's categories) so screenshots look right in plan 18.
- Keep `resetDb()` fast: TRUNCATE with CASCADE, not per-table deletes; integration suites will call it hundreds of times.
- `pgcrypto` is only for `gen_random_uuid()` on older images; Postgres 16 has it built in — keep the extension line harmless.

## 9. Implementation prompt

```
You are implementing plan P02 from docs/plans/02-database-schema-migrations.md. Read docs/plans/00-README.md (R2, R6, R7, R17) and DESIGN.md §7, §9 (orderNumber), §11.3 (encryption, append-only) first. P01 is merged: use its EnvKeyProvider, Testcontainers harness and Vitest integration config.

Deliver: the complete Prisma schema for every §7 model and enum (no translation tables), migrations including hand-written SQL for pg_trgm, the generated product search_vector + GIN/trigram indexes, the check constraints listed in P02 §4.3, append-only triggers on audit_log and stock_movement, per-year order-number sequences with next_order_number(), and app_rw/app_migrate roles; the Prisma encryption extension driven by an explicit encrypted-fields map (including Order.shippingAddress JSON paths) that also maintains phoneHmac; forUser scoping helpers with one example repository; applyMovement() as the sole writer of variant.stock using SELECT … FOR UPDATE; the idempotent seed (taxonomy from DESIGN §2.2, 24 products, admin user, SiteSetting defaults incl. placeholder GST profile and Chennai pickup); test/helpers/db.ts with migrate/resetDb/seedMinimal; and a prisma migrate diff drift check in CI.

Work test-first using the integration tests in P02 §6 against the real Postgres container — constraints, triggers, tsvector, concurrent order numbers, encryption roundtrip and blind-index lookup, applyMovement concurrency (20 parallel reservations on stock 10 → exactly 10 succeed), seed idempotency. Do not mock Prisma.

Constraints: immutable data, files ≤ 400 lines, no direct writes to variant.stock anywhere except applyMovement, never edit an applied migration, prismaRaw is the only client without the encryption extension and is not used by application modules.

When done: fresh `docker compose up -d`, `pnpm db:migrate && pnpm db:seed`, `pnpm test:int` green, CI drift check green. Complete the P02 Definition of Done with evidence and stop for review.
```
