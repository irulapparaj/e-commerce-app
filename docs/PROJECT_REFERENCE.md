# Project Reference — Puja Essentials (e-commerce-app)

> **Purpose:** Hand this file to an AI coding session instead of letting it re-explore the codebase.
> It captures the architecture, workflows, conventions, endpoint/data maps, and current status.
> **As of 2026-09-28**, branch `feat/p04-catalogue`. Verify volatile facts (git state, §13–14) against the repo before acting on them; everything else is stable design.

---

## 1. What this project is

- **Product:** "Puja Essentials" — a custom-built Indian devotional-goods e-commerce platform (brand name in code: **"Invita Company"**, `packages/shared/src/brand.ts`). Feature/UX reference: devdarshandhoop.com (a Shopify store), but built fully custom — no Shopify/hosted builder.
- **Market:** India-only shipping and payments in V1. Dispatch from Chennai, Tamil Nadu. B2C.
- **Scope:** Responsive **web storefront only** (no native app; "mobile" = phone-width web). English-only Phase 1 (Hindi/Tamil in Phase 4, Tamil first).
- **Catalogue:** 7 top-level categories (agarbatti, dhoop, puja-samagri, air-care, home-fragrance, body-fragrance, more) with ~58 child collections.
- **Key business rules:**
  - Login (passwordless email OTP) is **required before checkout**. Guest carts live in Valkey 7 days and merge at login.
  - Free shipping ≥ ₹599. **No COD.** Failed payment ⇒ order stays `PENDING` with 30-min retry window, then auto-cancel (restores stock + coupon).
  - `Idempotency-Key` header required on `POST /orders`. Order numbers `PE-YYYYNNNN` (per-year Postgres sequence).
  - Order status: `PENDING → CONFIRMED → DISPATCHED → IN_TRANSIT → DELIVERED` (+ `CANCELLED`, `RETURNED`).
  - Returns: 15 days from DELIVERED, defect-only (damaged/wrong/expired), 1–4 photos, seller-paid pickup (full flow lands in P22).
- **Master design doc:** `docs/DESIGN.md` (v1.3) — business requirements WF-01..17, threat model, GST rules, design language. This file summarizes it; go there for rationale.

## 2. Monorepo layout & commands

pnpm workspace (`pnpm@12.6.0`, Node ≥22.12, `.nvmrc`). Root package name `puja-essentials`.

```
apps/api        @pe/api  — Fastify 5 API (port 4000)
apps/web        @pe/web  — Next.js 15 storefront + admin (port 3000)
packages/shared @pe/shared — env schemas, error codes, envelope, money/tax, zod schemas, brand
packages/config @pe/config — tsconfig.base, eslint, prettier, tailwind preset
docs/           DESIGN.md, plans/ (P01–P28), security/, testing/, reviews/
scripts/        dev.sh (Homebrew stack), generate-dev-env.mjs, check-migration-drift.mjs, verify-hosting-agnostic.sh, demo.md
tests/e2e       Playwright journeys/a11y/visual; tests/perf (lighthouse, api-smoke); tests/fixtures
```

Root scripts: `pnpm dev` (both apps) · `build` · `lint` · `typecheck` · `test` (unit+coverage) · `test:int` · `test:e2e` · `db:generate|migrate|seed` · `db:drift` · `compose:up|down`.

**Quickstart:** `pnpm install` → `node scripts/generate-dev-env.mjs` (writes `.env` with fresh keys) → `docker compose up -d` → `pnpm db:migrate && pnpm db:seed` → `pnpm dev`. Mailpit UI :8025, MinIO console :9001. No-Docker alternative: `scripts/dev.sh start` (Homebrew postgresql@16/valkey/minio/mailpit; state in `.dev-stack/`).

## 3. Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 15.5 App Router, React 19, TypeScript 5.9, Tailwind v4 (via `@tailwindcss/postcss` + legacy JS config) |
| Web state | Zustand (cart store); React Hook Form + Zod; next-intl 4.14 |
| API | Node 22, Fastify 5.12, `fastify-type-provider-zod`, Zod 4 (NOT TypeBox) |
| DB | PostgreSQL 16, Prisma 6.19 |
| Cache/sessions | Valkey 8 (ioredis client) — carts, OTPs, rate limits, caches, idempotency |
| Jobs | pg-boss 12 in-process (gated by `JOBS_ENABLED`) |
| Search | Postgres FTS (`tsvector` + `pg_trgm`) Phase 1; Meilisearch planned P20 |
| Auth | Custom: email OTP → RS256 JWT (jose) 15-min access + rotating refresh families; TOTP MFA (otplib) for staff |
| Payments | Razorpay hosted Checkout (webhook is authority); no COD |
| Shipping | Shiprocket behind `ShippingPort` (fake adapter default) |
| Email | nodemailer SMTP (Mailpit local, SES ap-south-1 prod); react-email templates |
| Storage | S3 API (MinIO local); sharp + file-type media pipeline |
| Rich text | Tiptap JSON stored, server-rendered → sanitize-html; client only receives HTML |
| Testing | Vitest 3, Playwright 1.63, Testcontainers, @axe-core/playwright, autocannon, Lighthouse CI |
| CI security | Semgrep (+ custom `.semgrep/` rules), gitleaks, Trivy, ZAP baseline, pnpm audit |

## 4. Core architecture decisions

1. **BFF:** Browser talks ONLY to Next.js. `apps/web/app/api/[...path]/route.ts` proxies to Fastify at `API_INTERNAL_URL` (`/api/v1/*`). Tokens live in `__Host-*` httpOnly cookies on the web origin; API accepts Bearer only, never cookies. Server components verify JWT locally (public keys, no network).
2. **Hosting-agnostic ports/adapters:** `EmailPort`, `ObjectStoragePort`, `ShippingPort`, `SearchPort`, `KeyProvider` in `apps/api/src/ports/`. All config from env, Zod-validated at boot (`packages/shared/src/env.ts`, `strictObject`). No cloud SDK outside `ports/adapters/`. Enforced by `scripts/verify-hosting-agnostic.sh`.
3. **Money = integer paise** (branded `Paise` type, `packages/shared/src/money/`), GST-inclusive prices. Only Decimal in schema is `gstRate (5|12|18)`.
4. **GST (packages/shared tax helpers):** origin TN(33). TN destination ⇒ CGST+SGST; else IGST. `taxable = round(price*100/(100+rate))`, `tax = price − taxable`, CGST = ceil(tax/2) (odd paisa → CGST). All-zero GST allowed (exempt goods).
5. **Inventory:** append-only `StockMovement` ledger is truth; `variant.stock` is a cached value. Sole writer: `apps/api/src/modules/inventory/apply-movement.ts` (`SELECT … FOR UPDATE`, reject negative, insert ledger row, update cache). Nightly `ledger-check` job detects drift. DB triggers block UPDATE/DELETE on `stock_movement` and `audit_log`.
6. **Rendering:** ISR (home 3600s, collection/PDP 900s, categories 300s, settings 60s) + on-demand revalidation: API writes enqueue a `revalidate` job → `POST {WEB_ORIGIN}/api/internal/revalidate` with timing-safe `x-revalidate-secret` → `revalidateTag`. Tags: `home`, `categories`, `category:{slug}`, `product:{slug}`, `search`, `settings`.
7. **One Next app, two surfaces:** storefront under `app/(storefront)/[locale]/`, admin under `app/(admin)/admin/` gated on `aud=admin`. No root layout — each group renders its own `<html>`.
8. **Response envelope** (`packages/shared/src/envelope.ts`): `{success:true, data, error:null, meta?}` / `{success:false, data:null, error:{code,message,details?}}`. Stable codes in `packages/shared/src/errors.ts` (`AppError`); e.g. VALIDATION 400, RATE_LIMITED 429 (+Retry-After), STEP_UP_REQUIRED 403, PRODUCT_INCOMPLETE 422. No stack traces/SQL in responses; IDOR ⇒ 404 identical to not-found.

## 5. Backend (apps/api)

### 5.1 Boot & assembly
- `src/server.ts`: `loadEnv(apiEnvSchema)` (exit 1 on failure) → `EnvKeyProvider.fromEnv` → `createDb(url, keys)` → `createPorts(env, {keys}, {prismaRaw})` → `createValkeyClient` → `buildApp` → listen. SIGTERM/SIGINT 10s grace. In test injects a fake `now` clock.
- `src/app.ts` `buildApp({env, ports, valkey, db, ...})`: Fastify with `trustProxy:true`, 1 MiB body limit, request-id echo, Zod type provider. `API_PREFIX='/api/v1'`. Registration order: base plugins (bootAssertions, sensible, securityHeaders, errorHandler, metrics, health, prisma) → rateLimit, auth, securityCounters → auth routes → jobs+catalogue plugins/routes → admin routes → cart (+ cart-merge on login hook) → orders plugin, address/shipping/order/razorpay-webhook/account/forms/newsletter/sitemap/suppression → adminOrder, shiprocketWebhook → order email hooks → test/dev extras. All plugins use `sharedPlugin` (`lib/plugin.ts`, skip-override — no encapsulation).
- `plugins/boot-assertions.ts` (skipped in test): rejects placeholder secrets, requires https `WEB_ORIGIN` in prod, rejects `RATE_LIMIT_MULTIPLIER` outside test.
- Ops endpoints: `GET /healthz`, `GET /readyz` (checks DB, valkey ping, S3 headBucket; 2s timeouts), `GET /metrics` (prom-client).

### 5.2 Endpoint map (all under `/api/v1` unless noted)
- **Auth:** POST `/auth/send-otp`, `/auth/verify-otp`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/reauth/send|verify`, `/auth/mfa/enrol|verify`, `/auth/step-up`; GET `/auth/me`; GET/DELETE `/account/sessions[/:id]`.
- **Public catalogue:** GET `/categories` (Valkey `cat:tree` 300s), `/categories/:slug/products`, `/products`, `/products/:slug` (ETag/304), `/search?q&type` (60/min/IP), `/settings/public`. Query: `sort=featured|newest|price_asc|price_desc`, `minPrice`/`maxPrice` paise, `page`, `limit` 12–48 (default 24); `meta.priceRange` histogram. **Stock never exposed** — only `inStock`/`lowStock`.
- **Cart:** GET `/cart`; POST `/cart/items`; PUT/DELETE `/cart/items/:variantId`; POST/DELETE `/cart/coupon`. Guest key from `X-Cart-Session` header; 120/min limit.
- **Orders/payments:** POST `/orders` (Valkey `idem:<user>:<key>`), POST `/orders/:id/verify-payment`, GET `/orders[/:id]`; POST `/webhooks/razorpay` (raw-body HMAC, timing-safe).
- **Shipping:** GET `/shipping/serviceability`; POST `/webhooks/shiprocket` (IP allowlist + `TRUSTED_PROXIES`).
- **Account:** PATCH `/account/profile`; POST `/account/export` (requires reauth amr); DELETE `/account`; `/account/addresses` CRUD + `/default`.
- **Admin (all via policy guards, §7.5):** products/variants/images/categories CRUD under `/admin/products`, `/admin/categories` (presign+confirm for images); `/admin/inventory` (+`/low-stock`, `/movements`, `/:variantId/adjust`, `/ledger-check`); `/admin/orders` (+`/status|ship|cancel|refund|notes|tracking|address`); `/admin/import` (template/upload/validate/apply, jobs), `/admin/export/{products|orders|customers}`; `/admin/customers` (+ sessions/reveal/disable/dpdp-export/dpdp-erase); `/admin/staff` (+role/mfa-reset/revoke-sessions); `/admin/settings`, `/admin/audit`, `/admin/security`, `/admin/stats`, `/admin/jobs/:id`; `/admin/email/suppress`.
- **Public forms:** POST `/forms/contact`, `/forms/seller-inquiry` (honeypot + rate limit), `/newsletter/subscribe`; GET `/sitemap-data`.
- **Unprefixed:** POST `/webhooks/email`; test-only `/__test__/reset|clock|jobs/run|webhooks/shiprocket` + `/api/v1/__test__/payments/simulate` (mounted only when `NODE_ENV=test`); dev-only GET `/dev/emails/:template`.

### 5.3 Ports (selected in `src/ports/index.ts` by env)
| Port | Adapters | Selector |
|---|---|---|
| email | SmtpEmailAdapter / FakeEmailAdapter (records mail) | `EMAIL_ADAPTER=smtp\|fake` (fake only in test) |
| storage | S3ObjectStorageAdapter (aws-sdk v3, path-style for MinIO) | always s3 |
| keys | EnvKeyProvider (AES-256-GCM `v1:iv:tag:ct`, HMAC blind index) | `KEY_PROVIDER=env` |
| shipping | FakeShippingAdapter (pincode lanes, `FAKE-` AWBs) / ShiprocketAdapter (token cached in Valkey, retry-once-on-401; reverse pickup NYI until P22) | `SHIPPING_ADAPTER=fake\|shiprocket` |
| search | NoopSearchAdapter / PostgresSearchAdapter (ts_rank ∪ trigram similarity>0.3 ∪ exact SKU) | `SEARCH_ADAPTER=noop\|postgres` |

### 5.4 Jobs (`src/jobs/queue.ts`, pg-boss)
`media-process` (magic-byte check → EXIF rotate → strip metadata → webp q80 + avif q55 @ 320/640/1024/1600 → delete original), `revalidate` (retries 1s/5s/30s), `ledger-check`, `import-validate`, `import-apply`, `export-generate`, `dpdp-export`, `retention`, `order.release` (unpaid orders), `email.send`, `email.order-cancelled`, `shipping.status.notify`. Workers register only when `JOBS_ENABLED=true`; tests run with it false and drive jobs via `/__test__/jobs/run`.

### 5.5 Conventions
- Validation: Zod 4 `z.strictObject` at every boundary (blocks mass assignment); shared schemas in `packages/shared/src/schemas/`.
- Rate limiting: per-route `app.rateLimiter.consume([...])` — Valkey ZSET sliding window (Lua, keys `rl:*`). No global limiter. `RATE_LIMIT_MULTIPLIER` honoured only in test.
- Logging: pino with heavy redaction (tokens, otp, cookies, phone, address lines, totp); emails logged as `sha256:xxxxxxxx`. Silent in test.
- Valkey key map: `rl:*` `otp:*` `cart:*` `idem:*` `cat:tree` `settings:public` `admin:stats` `sec:*` `shiprocket:token`.
- Catalogue writes: `$transaction` + `recordAudit()` (PII-redacted before/after) + `revalidate.notify(tags)`. Server-generated stable slugs. New products `isActive=false`; publish requires ≥1 variant and ≥1 image (`PRODUCT_INCOMPLETE`); delete blocked if orders/movements exist.

## 6. Database (Prisma → PostgreSQL 16)

### 6.1 Conventions & invariants
- PKs: uuid via `gen_random_uuid()`. snake_case via `@map`/`@@map`. Timestamps `Timestamptz(3)`. Money `Int` paise.
- Extensions: pg_trgm, pgcrypto. `product.search_vector` is a GENERATED STORED tsvector (name/sku weight A, tags B) + GIN; trigram GIN on product/category names.
- CHECKs: tax pair, non-negative amounts/stock, qty>0, delta≠0, rating 1–5, 1–4 return photos. Append-only statement triggers on `audit_log` + `stock_movement` (fire even on 0-row DELETEs). `next_order_number()` SQL fn with advisory lock + per-IST-year sequences. DB roles `app_migrate`/`app_rw`.

### 6.2 Model map (25 models, 17 enums — key fields only)
- **Identity:** `User` (email unique, phone enc + phoneHmac blind idx, role CUSTOMER|ADMIN|STAFF, isDisabled, mfaEnabled, totpSecret enc, mfaRecoveryCodes sha256[], deletedAt soft-delete) · `RefreshToken` (familyId, audience STOREFRONT|ADMIN, tokenHash unique, expiresAt/lastUsedAt/revokedAt, ip, UA) · `Address` (phone/line1/line2 enc, state 2-letter — drives GST split, pincode char(6)).
- **Catalogue:** `Category` (slug unique, self-parent, imageKey, sortOrder) · `Product` (slug+sku unique — sku is import upsert key, description Json Tiptap, categoryId Restrict, hsnCode, gstRate Decimal(5,2), tags[], isActive, isFeatured, searchVector) · `ProductVariant` (sku unique, price paise, compareAtPrice, stock cache CHECK≥0, lowStockThreshold 10, weightGrams, isDefault) · `ProductImage` (objectKey, alt, sortOrder) · `StockMovement` (append-only: delta≠0, reason ORDER_RESERVE|ORDER_RELEASE|SALE|RETURN_RESTOCK|ADJUSTMENT|IMPORT, referenceId, actorId) · `ImportJob` (status UPLOADED|VALIDATED|APPLIED|FAILED, fileKey/fileHash, report Json, row counts).
- **Orders:** `Order` (orderNumber unique PE-YYYYNNNN, email, phone enc+hmac, shippingAddress Json snapshot w/ enc keys, destinationState, subtotal/shipping/discount/cgst/sgst/igst/total paise, status, paymentStatus PENDING|PAID|FAILED|REFUNDED|PARTIALLY_*, razorpayOrderId/PaymentId, couponCode string, tracking/courier/shiprocketOrderId, deliveredAt) · `OrderItem` (full price/name/sku/hsn/gstRate snapshot, qty>0) · `OrderStatusEvent` (source SYSTEM|ADMIN|WEBHOOK) · `ReturnRequest` (reason/status/resolution enums, photoKeys 1–4, deduction/refund amounts, razorpayRefundId).
- **Integrations/governance:** `WebhookEvent` (@@unique[provider, externalId] — replay dedupe; RAZORPAY|SHIPROCKET|EMAIL) · `AuditLog` (append-only, redacted before/after Json).
- **Engagement:** `Review` (orderItemId unique ⇒ verified-purchase only, status PENDING|APPROVED|REJECTED) · `WishlistItem` (@@id[userId,variantId]) · `Coupon` (code unique, PERCENT|FIXED, usedCount atomic) · `BlogPost` · `SiteSetting` (key PK, Json value) · `EmailSuppression` (emailHash PK) · `NewsletterSubscriber` (emailHash unique + emailEncrypted, consent tracking).

### 6.3 Field-level encryption
- Prisma client extension (`src/db/encryption-extension.ts` + `crypto-walk.ts`): encrypts on write (incl. nested writes), decrypts on read, recomputes blind indexes from plaintext. `where` clauses are NOT encrypted ⇒ **lookups must use `phoneHmac`**. Decrypts only strings with `v1:` prefix.
- Field map (`src/db/encrypted-fields.ts`, snapshot-tested): `User.phone→phoneHmac`; `Address.{phone,line1,line2}`; `Order.phone→phoneHmac` + Json `shippingAddress.{line1,line2,phone}`. Encrypted manually: `User.totpSecret`, `NewsletterSubscriber.emailEncrypted`.
- Keys: `ENCRYPTION_KEY_B64`, `BLIND_INDEX_KEY_B64` (32 bytes each). No rotation yet beyond `v1:` prefix.
- Client: `createDb(url, keys)` → `{prisma (extended), raw}`, shared pool (`src/db/prisma.ts`). IDOR-safe query fragments in `src/db/scoping.ts` (`forUser`).

### 6.4 Migrations & seeds
- 5 migrations, naming `YYYYMMDDHHMMSS_pNN_desc`; init (742 lines) carries the hand-written SQL block (extensions, tsvector, checks, triggers, sequences, roles). Drift gate: `pnpm db:drift` (`scripts/check-migration-drift.mjs`, needs `SHADOW_DATABASE_URL`; one allow-listed statement).
- Seed (`prisma/seed.ts` → `seed-runner.ts`, idempotent upserts): 7 categories + 58 children, 24 products/27 variants (Zod-validated `seed-data/*.json`; rupee strings → paise), stock applied through the ledger, admin `admin@example.test`, `SETTING_DEFAULTS` (never overwrites existing). `seedMinimal()` = int-test baseline. Untracked helpers fetch Wikimedia images → sharp → MinIO (`seed-images.ts` etc.).

## 7. Auth & security

### 7.1 Customer login (email OTP)
1. `POST /auth/send-otp {email}` → per-email 3/10min + per-IP 10/h limits → 6-digit code + uuid nonce stored as Valkey hash `otp:{sha256(email)}:{nonce}` (HMAC of code, TTL 600s, 5 attempts) → email sent → response padded to ≥250ms, always `{nonce}` (enumeration-proof; identical for unknown emails).
2. `POST /auth/verify-otp {email, nonce, otp}` → timing-safe compare → unknown email **auto-creates CUSTOMER** → CUSTOMER gets session; ADMIN/STAFF get 300s `aud:mfa` token (`{mfaRequired}` or `{mfaEnrolmentRequired}`).

### 7.2 Tokens & refresh families (`modules/auth/token.service.ts`, `refresh.service.ts`)
- RS256 (jose), strict kid lookup from `JWT_KEYS_JSON`/`JWT_ACTIVE_KID`, claims Zod-validated: `sub, role, aud(storefront|admin|mfa), iss, jti, amr[], stepUpExp`. Access TTL 900s (mfa 300s). Separate `reveal` audience for P08 PII reveal.
- Refresh: opaque 32-byte token, only SHA-256 hash stored. Families: STOREFRONT 30d absolute/7d idle, ADMIN 8h/30min idle. Rotation is transactional (revoke old + successor keeps family & absolute expiry); **reuse of a revoked token revokes the whole family** (`auth.refresh.reuse_detected`). New CSRF token on every rotation.
- `user-state.ts`: 60s in-process cache of role/disabled/deleted/mfaEnabled checked on every request — **role authority is DB, not JWT**.

### 7.3 Staff MFA & step-up (ADMIN/STAFF only; customers use OTP reauth instead)
- Enrol (`aud=mfa`): otplib secret (window ±1) stored AES-GCM; 10 recovery codes stored hashed; returns QR. Verify: TOTP or recovery code (10/h/IP) → admin session.
- Step-up: `POST /auth/step-up` (TOTP only) → new admin token with `amr:['step-up']`, `stepUpExp=+300s`. Customer reauth (`/auth/reauth/*`) issues `amr:['reauth']` for `/account/export` etc.
- Staff lifecycle (`modules/staff/`): create (invite email), changeRole (protects last ADMIN), resetMfa, revokeSessions — all audited + session-revoking.

### 7.4 BFF cookies & CSRF (`apps/web/lib/auth/`)
- Cookies (all Secure, SameSite=Lax, Path=/): `__Host-access` (httpOnly, 900s) · `__Host-refresh` (httpOnly, 30d storefront / 8h admin) · `__Host-csrf` (JS-readable, double-submit) · `__Host-mfa` (httpOnly, 300s) · `__Host-cart`/`cart-session` (guest cart id, 7d, sent to API as `x-cart-session`).
- BFF auth handlers in `lib/auth/bff.ts` mounted at `/api/auth/*`; pre-session routes check same-origin (`Sec-Fetch-Site`/Origin), post-session routes check same-origin + `x-csrf-token` double-submit (timing-safe).
- Catch-all proxy (`lib/auth/proxy-handler.ts`): CSRF on body-carrying requests; access-cookie → Bearer; on 401 does ONE single-flight refresh (keyed by refresh-token hash) and retries; strips cookie/authorization/set-cookie both directions.
- Web-side session: `lib/auth/session.ts` `getSession()` verifies RS256 locally (`JWT_PUBLIC_KEYS_JSON`) — no API call. Server components pass session down as props; no client session context.

### 7.5 Guards & admin policy matrix
- API guards (`modules/auth/guards.ts`): `authenticate(aud)`, `requireRole`, `requireMfaEnrolled`, `requireStepUp`, `requireAmr`.
- `modules/admin/policies.ts` `ADMIN_POLICIES`: ~45 named policies `{roles, stepUp}`; `policyGuards()` builds `authenticate('admin') → requireMfaEnrolled → requireRole → [requireStepUp]`. Step-up required for: staff.write, settings.write, orders.refund/cancel, customers.reveal/erase, variants.price, etc. Mirrored (UI-only) in `apps/web/components/admin/Nav.config.ts` + `lib/admin/rbac.ts`; `StepUpProvider` opens a TOTP dialog on 403 `STEP_UP_REQUIRED` and retries.

### 7.6 Security posture
- Headers: helmet CSP `default-src 'none'` (API); web middleware adds per-request nonce CSP + security headers per surface (admin CSP excludes Razorpay). `Cache-Control: no-store` on authenticated API responses.
- Security events (`security-events.ts`): 27 event names → Prometheus counter `auth_events_total` + structured logs; Valkey 24h buckets for otp/mfa failures surfaced at `GET /admin/security`.
- Webhooks: Razorpay raw-body HMAC + `WebhookEvent` unique(provider, externalId) replay dedupe; Shiprocket IP allowlist.
- Test suites enforce: enumeration timing (<50ms delta, ≥245ms floor), log redaction, IDOR sweep, RBAC matrix, mass assignment, injection corpus, rate limits, cookies, redirects, uploads, webhook replay (`apps/api/test/security/`).
- Error policy (`docs/security/error-policy.md`): envelope only, IDOR=404, OTP send always 200, 429 carries Retry-After.

## 8. Frontend (apps/web)

### 8.1 Routes
- **Storefront** `app/(storefront)/[locale]/`: `/` (home: Hero, TrustStrip, CategoryGrid, best sellers, ReassuranceBand, Testimonials, BrandStory, FAQ) · `/collections` + `/collections/[slug]` (toolbar: sort/price-filter/view, 24/page) · `/products/[slug]` (gallery, variant selector, add-to-cart/buy-now, specs, related, Product+Breadcrumb JSON-LD) · `/search` · `/cart` · `/checkout` + `/checkout/success/[orderId]` · `/login` · `/account` (orders/[id], addresses, security) · `/pages/[slug]` · `/policies/[slug]` · `/dev/components|emails` (404 in prod) · error/loading/not-found/opengraph-image.
- **Admin** `app/(admin)/admin/`: `login`, then `(shell)/`: dashboard, products (+new/[id]), categories, inventory (+movements), import (+[jobId], images), export, orders (+[id]), customers (+[id]), settings, staff, audit, security. Shell layout re-checks session + fetches `/auth/me`.
- **Route handlers:** `/api/[...path]` proxy · `/api/auth/*` (8 BFF routes) · `/api/cart-session` · `/api/internal/revalidate` · `/api/healthz` · `robots.ts`, `sitemap.ts` (reads API `/sitemap-data`), `.well-known/security.txt`.

### 8.2 i18n & middleware
- next-intl: locales `['en']`, `localePrefix: 'as-needed'` (no /en prefix in URLs), timezone Asia/Kolkata, messages in `messages/en.json` (~378 lines; namespaces account/login/home/catalogue/shell/nav/footer/a11y/cart/errors). **Admin UI is hard-coded English** (no next-intl).
- `middleware.ts` (matcher excludes `/api`): CSP nonce → header injection; `/admin/**` requires `aud=admin` else redirect `/admin/login`; `/checkout*`+`/account*` (locale-stripped) require `aud=storefront` else `/login?redirect=` (validated); else next-intl middleware.

### 8.3 Data fetching
- Server: `lib/api/server.ts` `apiGet(path, {tags, revalidate, auth})` → `${API_INTERNAL_URL}/api/v1` with Next cache tags; `auth:true` ⇒ Bearer + no-store. `lib/api/storefront.ts` typed fetchers + `CACHE_TAGS`; tree/settings/featured fall back gracefully, collections/PDP throw. DTOs in `lib/api/types.ts`.
- Browser: `lib/api/client.ts` `apiClient` → same-origin `/api/v1/*` (proxy) with CSRF header. Admin: `lib/admin/api.ts` (`adminApi`, step-up retry) + `lib/admin/server.ts` (`adminServerGet`, admin pages are `force-dynamic`).
- Cart state: `stores/cart.ts` (zustand) + `/api/cart-session`.

### 8.4 Design system
- **Direction: "Minimalist & Clean"** (DESIGN.md §16). Tokens in `styles/tokens.css`: light bg `#fbfaf7`, text `#1c1a17`, hairline `#e8e3da`, single saffron accent `#d9772b` (CTA + free-shipping bar only); dark bg `#141210`. 1.25 modular scale with clamp(), 8-pt grid, 1200px content, 44px touch targets, radius 6px controls/2px images, 150/250ms motion (0 under reduced-motion), hairlines over cards, 4:5 product images.
- Tailwind v4 + shared preset (`packages/config/tailwind.preset.ts`) mapping utilities to CSS vars; extras in `apps/web/tailwind.config.ts` (aspect-product, grid-cols-layout, z tokens, keyframes).
- **Theming, 2 axes:** `[data-theme]` light/dark (cookie, SSR-read, no flash, no `dark:` variants) × `[data-skin]` — skins `classic`(default), `mandir-gold`, `pushpa-purity`, `utsav-rang`, `sandhya-aarti` (`styles/skins.css`, `SkinMenu`, cookie, server-rendered).
- Fonts (next/font/google): Fraunces (display) + Manrope (body); 8 skin fonts with `preload:false`.
- Components: `components/ui/` (Button, Dialog, Drawer, Field, Icon sprite, Price, Tabs, Toast, primitives + axe test), `layout/` (Header, MegaMenu, MobileNav, Footer, SkipLink, ThemeToggle, SkinMenu), plus catalogue/, cart/, checkout/, account/, auth/, content/, admin/**. Admin styled separately: dense utilitarian plain-CSS `admin-*` classes in `styles/admin/*.css`, same color tokens, no next/font.

## 9. Environment variables (validated in `packages/shared/src/env.ts`; drift-tested against `.env.example`)

Core: `NODE_ENV PORT LOG_LEVEL DATABASE_URL VALKEY_URL`. Storage: `S3_ENDPOINT S3_REGION S3_BUCKET_MEDIA S3_BUCKET_IMPORTS S3_ACCESS_KEY S3_SECRET_KEY S3_FORCE_PATH_STYLE MEDIA_PUBLIC_BASE_URL`. Email: `SMTP_URL EMAIL_FROM CONTACT_INBOX_EMAIL`. Crypto/JWT: `ENCRYPTION_KEY_B64 BLIND_INDEX_KEY_B64 JWT_ACTIVE_KID JWT_KEYS_JSON JWT_PUBLIC_KEYS_JSON JWT_ISSUER`. URLs/secrets: `API_INTERNAL_URL WEB_ORIGIN REVALIDATE_SECRET HMAC_SECRET UNSUBSCRIBE_BASE_URL`. Razorpay: `RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET`. Adapters: `EMAIL_ADAPTER STORAGE_ADAPTER KEY_PROVIDER SHIPPING_ADAPTER SEARCH_ADAPTER SEARCH_SIMILARITY_THRESHOLD` + `SHIPROCKET_{EMAIL,PASSWORD,WEBHOOK_SECRET,BASE_URL,WEBHOOK_IPS}`. Ops: `JOBS_ENABLED PII_REVEAL_TTL_SECONDS TRUSTED_PROXIES SENTRY_DSN RATE_LIMIT_MULTIPLIER(test-only) OTP_IP_RATE_LIMIT OTP_EMAIL_RATE_LIMIT NEXT_PUBLIC_MEDIA_HOST`.
Web schema subset: `API_INTERNAL_URL WEB_ORIGIN REVALIDATE_SECRET JWT_PUBLIC_KEYS_JSON JWT_ISSUER NEXT_PUBLIC_MEDIA_HOST? SENTRY_DSN?`.

## 10. Testing

### 10.1 Layers & gates
| Layer | Command / config | Location | Coverage gate |
|---|---|---|---|
| Unit (all pkgs) | `pnpm test` → root `vitest.config.ts` projects | `*.test.ts(x)` beside code | 80% global; 95% shared money/tax |
| API integration + security | `pnpm test:int` → `apps/api/vitest.int.config.ts` (forks, serial files, globalSetup containers) | `apps/api/test/int/**`, `test/security/**` | **95/95/95/95** on selected dirs |
| Web unit | in root run; node env, `.tsx` opts into jsdom via docblock | lib/app/components/stores | 80%; 85% ui/layout/lib-api |
| E2E | `pnpm test:e2e` → `playwright.config.ts` | `tests/e2e/` | n/a |
| Perf | `tests/perf/lighthouserc.json` (LCP<2.5s, TBT<200, CLS<0.1, JS<150KB); `api-smoke.js` p95<300ms | | |

Rule (docs/plans/00-README): **never mock Prisma/DB**; mock only external HTTP (Razorpay/Shiprocket via msw/fakes).

### 10.2 Integration harness (`apps/api/test/helpers/`)
- `containers.ts` (globalSetup): starts postgres:16-alpine (`pe_test`) + valkey 8 + MinIO + Mailpit via Testcontainers, creates buckets, runs `prisma migrate deploy` once. **`TEST_STACK=external` skips containers** — requires `TEST_DATABASE_URL TEST_VALKEY_URL TEST_S3_ENDPOINT TEST_SMTP_URL TEST_MAILPIT_URL` (works against the `dev.sh` Homebrew stack; create `pe_test` DB yourself).
- `app.ts` `buildTestApp()`: real Fastify app, real DB/Valkey, fake email, `SEARCH_ADAPTER=postgres`, `JOBS_ENABLED=false`, per-process RSA keys, env from `test/fixtures/env.test`.
- `db.ts` `resetDb()`: TRUNCATE all tables CASCADE + restart order sequences, in `beforeEach`. Single shared DB, serial files — no parallel schemas.
- `mailpit.ts` polls Mailpit search API for OTP emails.

### 10.3 E2E (`tests/e2e/`)
- Projects: chromium (journeys+a11y+smoke), firefox/webkit/mobile-chromium(Pixel 5)/tablet (journeys), visual (Desktop Chrome, `visual/**`).
- globalSetup waits on `/readyz`, and if catalogue empty logs in as admin via UI (Mailpit OTP + TOTP, `E2E_ADMIN_TOTP_SECRET`) and imports 50-product CSV.
- Journeys: auth, account, browse, cart, checkout, tracking, returns, static, home-sections, appearance, admin-{shell,catalogue,import,orders,customers}; ~28 tagged `@critical`.
- a11y: axe (wcag2a/aa/21aa/22aa; serious+critical block) over 7 pages × themes, shell landmarks/focus traps, skins. Visual: `toHaveScreenshot` maxDiffPixelRatio 0.01, pages×viewports(375/768/1440)×themes×skins; **baselines are darwin-only PNGs**.
- Test-only API hooks drive determinism: `/__test__/reset`, `/__test__/clock`, `/__test__/jobs/run`, payment stub, shiprocket webhook injection.
- Full local E2E: `node scripts/generate-dev-env.mjs .env.e2e` → `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build` → `MAILPIT_URL=http://localhost:8025 pnpm test:e2e`.
- Flaky policy (`docs/testing/flaky-policy.md`): retry-pass = flaky → `@flaky` tag + issue, 7-day grace, none allowed at v1.0.0-phase1 tag. Journey↔WF mapping in `docs/testing/journey-matrix.md`.

### 10.4 CI (`.github/workflows/ci.yml`, push main + PRs, SHA-pinned actions)
Jobs: lint · typecheck · unit (coverage artifact) · integration (Testcontainers; `pe_shadow` service only for `db:drift`) · build (docker buildx `pe-api:ci`/`pe-web:ci`) · sast (semgrep registry + custom `.semgrep/` rules) · security (gitleaks, pnpm audit high, Trivy fs+image) · e2e (compose stack; `@critical` on 5 projects, rest chromium-only continue-on-error) · visual + lighthouse (push or `visual` label) · zap (PRs, baseline + allowlist).

## 11. Plan/workflow system (`docs/plans/`)

- One plan = one branch `feat/pNN-slug` cut from main = one squash-merged PR `[PNN] Title`; PR body = plan's DoD ticked with evidence; split at ~800-line diffs; run `/code-review` first, fix CRITICAL/HIGH.
- Phase 1 = P01–P18 (code complete, ~75 dev-days); Phase 2 = P19 deployment (all infra decisions deferred there); Phase 3 = P20–P25 (Meilisearch, wishlist/reviews, returns, coupons, blog/newsletter, ops); Phase 4 = P26–P27 (partial pay, GST invoice PDF, bundles, hi/ta i18n); Phase 5 = P28 (WhatsApp/SMS).
- Code limits: files ≤400 typical/800 max, functions ≤50 lines, nesting ≤4. Coverage 80% baseline; 95% money/tax/auth/cart/orders/payments.
- Hosting choice deferred to P19; default tier = lean AWS (~$42/mo).

## 12. Current status (SNAPSHOT 2026-09-28 — re-verify with `git log`/`git status`)

- **Committed:** only P01 (foundation), P02 (database), P03 (auth) — commits `d31fe46`, `5478d88`, `119390a` on stacked branches; `main` behind.
- **Uncommitted but implemented:** essentially ALL of P04–P18 sits dirty/untracked in the working tree of `feat/p04-catalogue` (~257 paths): every API module beyond auth/staff, 4 of 5 migrations, the whole storefront+admin UI, the E2E/visual/a11y suites, CI additions, and the entire `docs/` tree. No git tags.
- **Phase-1 review** (`docs/reviews/2026-09-phase1-review.md`): initial NO-GO with 9 CRITICAL/17 HIGH; after fix pass all CRITICALs + most HIGHs fixed; lint 0 errors, typecheck clean, 986 unit tests green. **Still NO-GO** on: checkout E2E doesn't prove full payment flow (F-01); missing visual baselines for pages.spec (F-06); tracking/returns specs are skeletons (F-11); `verify-hosting-agnostic.sh` fails (2 script bugs + real `API_INTERNAL_URL` env read); `test:int`, `db:drift`, E2E×3 not yet run; exit checklist (`docs/plans/phase1-exit-checklist.md`) 0/34 ticked; no `v1.0.0-phase1` tag.

## 13. Known gaps & bugs (found by static analysis 2026-09; verify before fixing)

**Auth/web:** customer re-auth broken from browser (no BFF route for `/api/auth/reauth/*` so proxy misses `/v1`; wrong send body; reauth token never written to `__Host-access`) · cart merge-on-login likely inert (nothing sets `x-previous-session`) · no silent refresh on page navigation (expired access cookie ⇒ redirect to login even with valid refresh; only proxied API calls refresh) · customer `LoginCard` ignores `mfaEnrolmentRequired` · `verify-otp` has no per-IP limiter (only 5 attempts/nonce).
**API:** `server.ts` never passes `valkey` into `createPorts` ⇒ `SHIPPING_ADAPTER=shiprocket` throws at boot · `src/security/route-registry.ts` (112 declared routes) has drifted from real routes (missing routes, wrong methods, phantom `/auth/mfa/verify-step-up`) · `SENTRY_DSN`/`API_INTERNAL_URL` declared but never read in api src.
**DB/tests:** `/__test__/reset` uses `app.prisma.deleteMany` on append-only tables — statement-level triggers should make it always fail (comment claims prismaRaw) · two `.semgrep/` rules can never match (`variant.update` vs real `productVariant`; `patterns:` used where `pattern-either` intended).
**CI (new jobs):** e2e job needs `.env.e2e` which is gitignored and never generated in CI · compose overlay has `build:` without `image:` so loaded CI images are rebuilt · zap job starts the e2e overlay without the base compose file · visual baselines are `*-darwin.png` — Linux CI will fail snapshot lookup.
**Web:** locale-prefixed URL inconsistency (`lib/catalogue/urls.ts`, ProductCard, collections links emit `/en/...` which redirects under `localePrefix:'as-needed'`).
**Docs drift:** error-envelope naming differs between error-policy/00-README/P04; controls-matrix vs DESIGN disagree on OTP limits, refresh SameSite, PDF uploads; journey-matrix marks skeleton specs green and mislabels WF-08/09/10/16. README CI section and auth spec path are stale; `dev.sh` undocumented there.

## 14. Key file index

| Concern | Files |
|---|---|
| Env schemas | `packages/shared/src/env.ts` (+ `.env.example`, `apps/api/src/env-example.test.ts`) |
| Errors/envelope | `packages/shared/src/errors.ts`, `envelope.ts`; handler `apps/api/src/plugins/error-handler.ts` |
| Money/GST | `packages/shared/src/money/`, tax helpers + `apps/api/src/modules/tax/` |
| App assembly | `apps/api/src/server.ts`, `src/app.ts`, `src/plugins/*` |
| Auth core | `apps/api/src/modules/auth/{token,otp,login,refresh,mfa,user-state}.service.ts`, `guards.ts`; plugin `src/plugins/auth.ts` |
| Admin RBAC | `apps/api/src/modules/admin/policies.ts`; web `components/admin/Nav.config.ts` |
| Ports | `apps/api/src/ports/index.ts`, `ports/adapters/*` |
| DB client/encryption | `apps/api/src/db/{prisma,encryption-extension,crypto-walk,encrypted-fields,scoping,order-number}.ts` |
| Schema/seed | `apps/api/prisma/schema.prisma`, `seed-runner.ts`, `seed-data/` |
| Inventory ledger | `apps/api/src/modules/inventory/apply-movement.ts` |
| Jobs | `apps/api/src/jobs/queue.ts`, `src/plugins/jobs.ts` |
| BFF | `apps/web/lib/auth/{bff,proxy-handler,api-client,session,cookies,csrf}.ts`, `app/api/[...path]/route.ts`, `middleware.ts` |
| Storefront data | `apps/web/lib/api/{server,storefront,client,types}.ts`, `lib/catalogue/*` |
| Design tokens | `apps/web/styles/{tokens,skins,typography,global}.css`, `packages/config/tailwind.preset.ts`, `apps/web/tailwind.config.ts` |
| Test harness | `apps/api/test/helpers/{containers,app,db,env,mailpit}.ts`, `test/fixtures/env.test` |
| E2E | `playwright.config.ts`, `tests/e2e/{global-setup,journeys,a11y,visual,helpers}` |
| Dev stack | `scripts/dev.sh`, `docker-compose.yml`, `docker-compose.e2e.yml`, `scripts/generate-dev-env.mjs` |
| Status/roadmap | `docs/plans/00-README.md`, `phase1-exit-checklist.md`, `docs/reviews/2026-09-phase1-review.md` |
