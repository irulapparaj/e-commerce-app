# Puja Essentials

Custom-built Indian devotional-goods e-commerce platform. Design: [docs/DESIGN.md](docs/DESIGN.md) · plans: [docs/plans/](docs/plans/).

## Prerequisites

- Node 22 LTS (`.nvmrc`) and pnpm 12 (`corepack enable` or `npm i -g pnpm@12.6.0`)
- Docker with Compose v2 (local stack and Testcontainers)

## Quick start

```bash
pnpm install
node scripts/generate-dev-env.mjs        # writes .env with fresh encryption/JWT keys
docker compose up -d                     # postgres, valkey, minio (+ bucket init), mailpit
pnpm db:migrate && pnpm db:seed          # from plan P02 onward
pnpm dev                                 # web on :3000, API on :4000
```

| Service              | URL                                                       |
| -------------------- | --------------------------------------------------------- |
| Storefront (Next.js) | http://localhost:3000                                     |
| Admin                | http://localhost:3000/admin                               |
| API (Fastify)        | http://localhost:4000 (`/healthz`, `/readyz`, `/metrics`) |
| Mailpit UI + API     | http://localhost:8025                                     |
| MinIO console        | http://localhost:9001 (minioadmin / minioadmin)           |
| Postgres             | localhost:5432 (`pe` / `pe`)                              |
| Valkey               | localhost:6379                                            |

## Repository layout

```
apps/web          Next.js 15 storefront + /admin (BFF route handlers under app/api)
apps/api          Fastify 5 API: modules, ports (+ local adapters), plugins, prisma
packages/shared   Zod env schemas, money + GST split, constants, error codes, brand
packages/config   tsconfig, ESLint, Prettier, Tailwind preset
tests/e2e         Playwright against the compose stack
docs/             DESIGN.md and implementation plans
```

## Scripts

| Command                            | What it does                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                         | Runs both apps with hot reload                                                                          |
| `pnpm lint` / `pnpm format:check`  | ESLint (type-aware) and Prettier                                                                        |
| `pnpm typecheck`                   | `tsc --noEmit` in every package                                                                         |
| `pnpm test`                        | Unit tests with v8 coverage (thresholds fail the build)                                                 |
| `pnpm test:int`                    | API integration tests on Testcontainers (Postgres, Valkey, MinIO, Mailpit); coverage in `coverage-int/` |
| `pnpm test:e2e`                    | Playwright (enabled in CI from plan P18)                                                                |
| `pnpm build`                       | Production builds of both apps                                                                          |
| `pnpm db:migrate` / `pnpm db:seed` | Prisma migrations and seed                                                                              |

### Running integration tests against an existing stack

Testcontainers needs Docker. To reuse the compose stack (faster) or any running services:

```bash
TEST_STACK=external \
TEST_DATABASE_URL=postgresql://pe:pe@localhost:5432/pe_test \
TEST_VALKEY_URL=redis://localhost:6379 \
TEST_S3_ENDPOINT=http://localhost:9000 \
TEST_SMTP_URL=smtp://localhost:1025 \
TEST_MAILPIT_URL=http://localhost:8025 \
pnpm test:int
```

## Testing conventions

- Unit tests live beside the code (`*.test.ts`); integration tests in `apps/api/test/int`, security tests in `apps/api/test/security`.
- The database, Valkey, MinIO and Mailpit are never mocked in integration tests; only external HTTP (Razorpay, Shiprocket) is.
- Coverage: 80 % lines/branches/functions per package; 95 % for `packages/shared/src/{money,tax}` and `apps/api/src/{db,modules/inventory}` (measured by the integration run, `coverage-int/`), and from later plans `apps/api/src/modules/{auth,cart,orders,payments,tax}`.
- `NODE_ENV=test` unlocks `RATE_LIMIT_MULTIPLIER` and the fake email adapter; both are rejected at boot otherwise.

## Database

- Schema: `apps/api/prisma/schema.prisma` (every DESIGN.md §7 model); migrations under `apps/api/prisma/migrations`.
- Objects Prisma cannot express live as hand-written SQL inside the migration files: the generated `product.search_vector` column, trigram indexes, check constraints, append-only triggers on `audit_log` and `stock_movement`, the per-year `order_number_seq_YYYY` sequences with `next_order_number()`, and the `app_rw` / `app_migrate` roles. Never edit a migration that has been applied; add a new one.
- Roles: `app_migrate` owns the schema; `app_rw` is what the application should connect as in Phase 2 (no `UPDATE`/`DELETE` on the ledger tables). Locally and in CI the superuser is used and the triggers are what tests assert.
- Drift check: `pnpm db:drift` (needs `SHADOW_DATABASE_URL`) compares migrations with the schema. Its only allow-listed statement is the `search_vector` "default" Prisma reports for the generated column; the list lives in `scripts/check-migration-drift.mjs`.
- Field-level encryption: `apps/api/src/db/encrypted-fields.ts` declares the PII columns and JSON paths; the Prisma extension encrypts on write, decrypts on read and maintains `phoneHmac`. Use `prismaRaw` only where ciphertext is intended (exports, tests).
- Stock: `applyMovement()` in `apps/api/src/modules/inventory` is the only writer of `product_variant.stock`; every change is a `stock_movement` row.
- Seed: `pnpm db:seed` loads the §2.2 taxonomy, 24 products, `admin@example.test` (MFA not yet enrolled) and `site_setting` defaults; it is idempotent.

## Authentication (P03)

- Customers sign in with an emailed one-time code (`POST /api/v1/auth/send-otp` → `verify-otp`); admins and staff then complete TOTP MFA (`/auth/mfa/enrol` on first login, `/auth/mfa/verify` afterwards). Sensitive admin actions need a step-up (`/auth/step-up`, 5 minutes).
- Access tokens are RS256 JWTs (15 min; 5 min for the `mfa` audience) signed with the active key in `JWT_KEYS_JSON`; the web app verifies them locally with `JWT_PUBLIC_KEYS_JSON`. Rotate keys by adding a new pair, switching `JWT_ACTIVE_KID`, and removing the old pair once its tokens have expired.
- Refresh tokens are opaque, hashed at rest, rotated on every use and grouped in families: reusing a rotated token revokes the whole family. Storefront sessions last 30 days (7 days idle), admin sessions 8 hours (30 minutes idle).
- The browser never sees tokens. Next.js route handlers under `apps/web/app/api/auth/*` are the BFF: they hold `__Host-access` / `__Host-refresh` (httpOnly) and `__Host-csrf` (readable) cookies and forward `Authorization: Bearer` to the API. The generic proxy at `app/api/[...path]` enforces CSRF on state changes (Sec-Fetch-Site or Origin plus `X-CSRF-Token` double submit), refreshes once on a 401 and strips cookies in both directions. The API itself never reads cookies.
- `__Host-` cookies are always `Secure`; use `http://localhost:3000` (a secure context) rather than `127.0.0.1` in development.
- `middleware.ts` sends unauthenticated visitors of `/checkout` and `/account/**` to `/login?redirect=<relative path>` and gates `/admin/**` on an admin session; the API enforces roles independently.
- Rate limits (Valkey sliding window): OTP sends 3 per email per 10 minutes and 10 per IP per hour; admin MFA and step-up attempts 10 per IP per hour. `RATE_LIMIT_MULTIPLIER` relaxes them only under `NODE_ENV=test`.
- Playwright specs for the flows live in `tests/e2e/auth.spec.ts` and run against the compose stack (`docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`, then `MAILPIT_URL=http://localhost:8025 pnpm test:e2e`); CI wiring is plan P18.

## Catalogue, media, search and jobs (P04)

- Public read API under `/api/v1`: `GET /categories` (two-level tree, cached in Valkey `cat:tree` for 5 minutes), `GET /categories/:slug/products` and `GET /products` (filters `sort=featured|newest|price_asc|price_desc`, `minPrice`/`maxPrice` in paise on the default variant, `page`, `limit` 12–48), `GET /products/:slug` (sanitised `descriptionHtml`, srcset per image, breadcrumb, up to 8 related products, `ETag`/304), `GET /search?q=&type=&limit=` (60/min/IP) and `GET /settings/public` (cached 60 s). Listings never expose stock numbers, only `inStock`/`lowStock`.
- Writes go through the services in `apps/api/src/modules/catalogue` (`products`, `variants`, `images`, `categories`, decorated as `app.catalogue`). Each runs in one transaction, writes an audit row through `recordAudit()` (`modules/audit/record.ts`, which redacts PII/secret keys), invalidates the category-tree cache and enqueues a `revalidate` job. Slugs are generated server-side and stay stable after creation.
- Rich text: products store a Tiptap JSON document validated by `richTextDocumentSchema` (`packages/shared/src/richtext.ts`: paragraphs, h2/h3, lists, bold, italic, https links, hard breaks). The API renders it with `@tiptap/html` and `sanitize-html` (`modules/richtext`); the storefront only ever receives HTML. The allow-list is pinned by a snapshot test.
- Media: `POST …/images/presign` returns a presigned PUT for `image/jpeg|png|webp|avif` ≤ 10 MB under a server-generated key `products/{productId}/{uuid}.{ext}` (or `categories/{categoryId}/…`); the browser uploads directly to the bucket and then calls `…/images/confirm`, which enqueues `media-process`. The job checks magic bytes with `file-type`, decodes with Sharp (polyglots and spoofed PDFs are rejected, deleted and audited as `media.rejected`), EXIF-rotates, strips metadata, writes `{base}-{320|640|1024|1600}.{webp|avif}` and deletes the original. `ProductImage.objectKey` stores only the base key. URLs come from `MEDIA_PUBLIC_BASE_URL` when set, otherwise one-hour presigned GETs.
- Search: `SEARCH_ADAPTER=postgres` uses the generated `search_vector` (websearch syntax, `ts_rank`) unioned with `pg_trgm` similarity on the name (threshold `SEARCH_SIMILARITY_THRESHOLD`, default 0.3) and exact product/variant SKU matches; active products only. Meilisearch arrives in P20 behind the same `SearchPort`.
- Jobs: `pg-boss` runs on `DATABASE_URL` in schema `pgboss`, created and migrated on boot (no Prisma migration is involved). Queues: `media-process`, `revalidate` (POSTs `{ tags }` to `${WEB_ORIGIN}/api/internal/revalidate` with `x-revalidate-secret`, retrying after 1 s, 5 s and 30 s) and `ledger-check` (cron `30 20 * * *` UTC = 02:00 IST). `JOBS_ENABLED=false` keeps the queue (enqueue/read) but starts no workers; the integration suite uses that and asserts on `pgboss.job` directly. The web route `apps/web/app/api/internal/revalidate/route.ts` compares the secret in constant time and calls `revalidateTag` per tag (`home`, `categories`, `search`, `product:{slug}`, `category:{slug}`).

## Admin console (P05, P06)

- Role matrix: `apps/api/src/modules/admin/policies.ts` encodes DESIGN §8.1 as data; every admin route builds its guards from a policy (`authenticate('admin')` → MFA enrolled → role → step-up) and `apps/api/test/int/admin/rbac.test.ts` iterates the same table for STAFF and ADMIN with and without step-up. The web sidebar is generated from `apps/web/components/admin/Nav.config.ts`; UI hiding is never the control.
- Settings: one Zod schema per key in `packages/shared/src/schemas/settings.ts` (`announcement_bar`, `promo_popup`, `free_shipping_threshold`, `brand`, `gst_profile` with `isPlaceholder`, `pickup_location`, `return_window_days`, `courier_preferences`). `GET /admin/settings` (STAFF+ADMIN), `PUT /admin/settings/:key` (ADMIN + step-up; audited; invalidates the public cache and revalidates `home` + `settings` for storefront-visible keys). `GET /settings/public` also carries the registered-business block (`legalName`, `gstin`, `addressLines`, `isPlaceholder`) that the storefront footer prints. The dashboard shows a warning until the GST placeholder is replaced.
- Staff: `GET /admin/staff`, `POST /admin/staff` (invite), `POST /admin/staff/:id/role` (refuses to demote the last active admin; revokes the target's sessions), `…/mfa-reset` (clears the secret and recovery codes, revokes sessions, emails the user; next login enrols again), `…/revoke-sessions`. All ADMIN + step-up and audited. Access tokens stay valid for up to 15 minutes after a revocation; keep the TTL short.
- Governance: `GET /admin/audit` (filters `actorId`, `entityType`, `entityId`, `action`, `from`, `to`; newest first), `GET /admin/security` (active admin sessions, 24 h counters for failed OTP/MFA, webhook signature failures per provider and ledger drift from Valkey hourly buckets in `modules/security-events/counters.ts`, `reconciliationMismatches: null` until P25), `POST /admin/security/sessions/:id/revoke`, `GET /admin/stats` (cached 60 s).
- Catalogue admin: `GET/POST /admin/products`, `PATCH /admin/products/:id/content` (STAFF+ADMIN), `PATCH …/commercial` and `PATCH …/publish` (ADMIN + step-up; publishing needs at least one variant and one processed image, otherwise `422 PRODUCT_INCOMPLETE`), `DELETE` (ADMIN + step-up; refused with 409 when ordered or when the ledger has movements), variants (`POST`, `PATCH …/variants/:variantId` content, `PATCH …/price`, `DELETE`), images (`presign`, `confirm`, `order`, alt, delete; 12 per product), categories (`GET` tree with counts, `POST`, `PUT`, `PATCH /admin/categories/reorder`, `DELETE` refused with children or products, `…/image/presign|confirm`), `GET /admin/jobs/:id` for upload polling.
- Inventory: `GET /admin/inventory` (search, category, `belowThreshold=true`), `GET /admin/inventory/low-stock`, `GET /admin/inventory/movements`, `POST /admin/inventory/:variantId/adjust { delta, note }` (delta only, never an absolute stock; ADMIN + step-up above 100 units; `409 INSUFFICIENT_STOCK` when the result would be negative) and `POST /admin/inventory/ledger-check` (ADMIN + step-up). The nightly job compares `variant.stock` with `SUM(delta)` per variant, logs `inventory.ledger.drift`, increments the security counter and writes an audit row; it never heals.

## Import / export (P07)

- Row format: `packages/shared/src/schemas/import-row.ts` is the single source for the 20 columns (`sku … meta_description`), the template header, the export header and the parser's accepted header. Every cell is validated as a string (`"007"` stays `"007"`), prices are rupees with at most two decimals, `specifications` is `key=value|key=value`, `tags` is `a|b`, and `stock` is the **target** absolute stock. Rows sharing a `sku` are one product; product columns must be identical across the group and categories must already exist (a typo in `category_slug` is an error, never a new category).
- Flow: `GET /admin/import/template?format=csv|xlsx` (BOM CSV or an XLSX with text-formatted columns) → `POST /admin/import { contentType, contentLength }` (ADMIN, 10 / day, ≤ 5 MB; presigned PUT to `imports/{jobId}.csv|xlsx` in `S3_BUCKET_IMPORTS`) → `POST /admin/import/:jobId/validate` (queues `import-validate`) → `GET /admin/import/:jobId` (report: creates, updates, stock deltas, first 200 errors; `…/errors` presigns the full error CSV) → `POST /admin/import/:jobId/apply` (ADMIN + step-up, queues `import-apply`). Status is `UPLOADED → VALIDATED | FAILED → APPLIED | FAILED`; any row error fails validation and apply refuses until a clean file is uploaded — partial applies do not exist.
- Parsing (`apps/api/src/modules/imports/parse.ts`): magic bytes must match the declared type (a zip declared as CSV, a CSV declared as XLSX, macro-bearing `xl/vbaProject.bin` or `xl/externalLinks/` workbooks are all refused), CSV goes through `papaparse` without dynamic typing, XLSX through `exceljs` where a formula cell becomes the literal text `=…` rather than its cached result, 5,000-row cap (`400 IMPORT_TOO_MANY_ROWS`), unknown header (`400 IMPORT_UNKNOWN_COLUMN`).
- Apply is one transaction: categories resolved by slug, products upserted by `sku` (slug generated on create, kept on update; a rich description is kept when the sheet still carries its plain-text projection), variants by `variant_sku`, stock written as `target − current` through `applyMovement({ reason: 'IMPORT', referenceId: jobId })`, one `import.applied` audit row, then revalidation. The apply route and the job both re-check the SHA-256 recorded at validation (`409` when the object changed). A failure anywhere rolls everything back and marks the job `FAILED` with the reason.
- Exports run as `export-generate` jobs into `exports/{type}-{uuid}.csv`: `POST /admin/export/products` (STAFF+ADMIN, the import format, round-trips), `POST /admin/export/orders|customers { full?, reason? }` (ADMIN + step-up; PII-minimised — masked phone, hashed email, no names or address lines — unless `full: true` with a reason ≥ 10 chars, audited as `export.requested`). `GET /admin/export/:exportId` returns the job state and a 15-minute presigned link; STAFF can only follow product exports. Every cell is quoted and cells starting with `= + - @ \t \r` get a leading `'` (`modules/exports/csv-safe.ts`). Files are deleted after 24 h by the daily `retention` job.

## Customers and DPDP (P08)

- Masking lives in `packages/shared/src/masking.ts` (`maskEmail`, `maskPhone`, `maskAddressLine`, `maskName`) and returns a `Masked` branded string; the STAFF-visible DTOs in `apps/api/src/modules/customers/detail.dto.ts` only accept `Masked` fields, and `packages/shared/src/masking.type-test.ts` fails `tsc` if a raw string ever fits. Integration tests also regex-scan the responses for phone numbers and address lines.
- `GET /admin/customers?q=` (STAFF+ADMIN) searches by email prefix, 10-digit phone through the blind index, or order number `PE-…`; staff accounts are never returned and asking for one by id answers 404. `GET /admin/customers/:id` is masked (addresses keep city/state/pincode clear), `…/sessions` lists live refresh sessions and `POST …/sessions/:sessionId/revoke` (ADMIN + step-up) ends one.
- Reveal: `POST /admin/customers/:id/reveal { reason ≥ 10 }` (ADMIN + step-up, 30 / day / admin — the 31st answers 429 and bumps `customer.pii.reveal.limited`, shown on `GET /admin/security` as `piiRevealLimited24h`) audits `customer.pii.reveal` with the reason and returns a JWT (`aud: reveal`, `PII_REVEAL_TTL_SECONDS`, default 300, bound to the customer and the admin). `GET /admin/customers/:id/pii` with `X-Reveal-Token` returns the plaintext and audits `customer.pii.read`; a token for another customer, another admin or past its expiry answers `401 REVEAL_EXPIRED`.
- `POST …/disable { reason }` (ADMIN + step-up) flags the account and revokes every session; OTP login then fails with the generic `INVALID_OTP`. `POST …/enable` (ADMIN) restores it. Both audited.
- DPDP: `POST …/dpdp-export` (ADMIN) queues `dpdp-export`, which writes `exports/dpdp/{userId}-{uuid}.json` (`{ version: 1, profile, addresses, orders, reviews, wishlist, sessions, consents }`, plaintext because it is the person's own data) and emails a 15-minute link; the file expires with the other exports. `POST …/dpdp-erase { reason }` (ADMIN + step-up) runs `eraseUser()` (`modules/dpdp/erase.service.ts`, also used by P15 with `source: 'SELF'`): email becomes `deleted+{id}@anon.invalid`, name `Deleted user`, phone and blind index null, addresses and wishlist deleted, sessions revoked, order snapshots reduced to city/state/pincode with the order rows kept for GST retention, `deletedAt` set, audited `customer.erased` with the source. Orders in `PENDING/CONFIRMED/DISPATCHED/IN_TRANSIT` block it (`409 ERASE_BLOCKED_ACTIVE_ORDERS`).
- The `retention` job (cron `0 21 * * *` UTC = 02:30 IST) deletes `exports/` objects older than 24 h and refresh tokens a week past expiry, and audits `retention.ran`; later plans append rules to it.

## Adding an environment variable

1. Add it to `apiEnvSchema` or `webEnvSchema` in `packages/shared/src/env.ts` (Zod, strict).
2. Document it in `.env.example` (a unit test fails if the two drift).
3. Read it from `app.env` (API) or `getWebEnv()` (web) — never from `process.env` directly.

## CI

`.github/workflows/ci.yml` runs on every PR: `lint`, `typecheck`, `unit`, `integration`, `build` (both images), `sast` (Semgrep `p/typescript`, `p/nodejs`, `p/owasp-top-ten`), `security` (gitleaks, `pnpm audit --audit-level=high`, Trivy fs + image) and `e2e` (enabled in P18). All of them are required checks on `main`. Actions are pinned by commit SHA and kept fresh by Renovate (`.github/renovate.json`, weekly, non-major grouped). pnpm's `minimumReleaseAge` policy is left at its default so freshly published packages are not installed.

## Hosting-agnostic rules

Everything is configured through environment variables validated at boot (DESIGN.md §4.2). Object storage uses the S3 API (MinIO locally), email goes through an SMTP `EmailPort` (Mailpit locally), field-level encryption through a `KeyProvider` (env key locally), shipping and search behind ports with local adapters. No cloud SDK is used for configuration.

## License

MIT
