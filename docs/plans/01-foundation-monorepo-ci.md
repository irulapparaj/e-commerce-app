# P01 — Foundation: monorepo, CI, compose, ports skeleton

|                  |                                                                   |
| ---------------- | ----------------------------------------------------------------- |
| Phase            | 1 — Code development                                              |
| Estimated effort | 4 dev-days                                                        |
| Depends on       | —                                                                 |
| Unblocks         | every other plan                                                  |
| Design refs      | DESIGN.md §4.1, §4.2, §5, §11.3 (supply chain), §13, §16 (tokens) |
| Branch           | `feat/p01-foundation`                                             |

## 1. Goal

A runnable, testable, CI-gated skeleton: both apps boot, the local stack comes up with one command, shared money/tax logic exists with full coverage, the ports and their local adapters exist so later plans never touch a cloud SDK for configuration, and every CI gate from the conventions is live.

## 2. Scope

### In

- pnpm workspace, TypeScript config, lint/format, Vitest workspace, Playwright placeholder
- `packages/config` (tsconfig, eslint, prettier, tailwind preset)
- `packages/shared`: env schemas, `Money`, `splitGst`, constants, common Zod validators, error codes, `brand.ts`
- `apps/api`: Fastify app factory, logger with redaction, error envelope, health/ready/metrics, Zod type provider, Dockerfile
- `apps/api/src/ports`: `EmailPort`, `ObjectStoragePort`, `KeyProvider`, `ShippingPort`, `SearchPort` interfaces + local adapters (SMTP/Mailpit, S3/MinIO, env key, fake shipping, no-op search)
- `apps/web`: Next.js 15 App Router skeleton with `[locale]` segment (en only), `admin` segment placeholder, BFF proxy placeholder, tokens.css, Dockerfile
- `docker-compose.yml` (+ `docker-compose.e2e.yml` skeleton), `.env.example`
- GitHub Actions CI with all gates; Renovate; PR template; CODEOWNERS

### Out

- Any database schema (plan 02), auth (03), real UI (09), business endpoints

## 3. Deliverables

```
pnpm-workspace.yaml  package.json  .nvmrc  .editorconfig  .env.example  vitest.workspace.ts
packages/config/{tsconfig.base.json, eslint.config.js, prettier.config.js, tailwind.preset.ts}
packages/shared/src/{env.ts, errors.ts, brand.ts, money/index.ts, tax/split-gst.ts, constants/{states.ts,hsn.ts,couriers.ts}, schemas/{common.ts}}
apps/api/src/{app.ts, server.ts, plugins/{env,logger,error-handler,metrics,health}.ts, ports/{index.ts,email.ts,object-storage.ts,key-provider.ts,shipping.ts,search.ts}, ports/adapters/{smtp-email.ts,s3-object-storage.ts,env-key-provider.ts,fake-shipping.ts,noop-search.ts}}
apps/api/{Dockerfile, vitest.config.ts, vitest.int.config.ts, test/helpers/{app.ts,containers.ts}}
apps/web/{app/[locale]/layout.tsx, app/[locale]/page.tsx, app/admin/layout.tsx, app/api/[...path]/route.ts, app/api/healthz/route.ts, middleware.ts, i18n.ts, messages/en.json, styles/tokens.css, Dockerfile, vitest.config.ts}
docker-compose.yml  docker-compose.e2e.yml
.github/{workflows/ci.yml, PULL_REQUEST_TEMPLATE.md, CODEOWNERS, renovate.json}
```

## 4. Tasks (ordered)

1. **Workspace.** `pnpm-workspace.yaml` (`apps/*`, `packages/*`); root scripts: `dev`, `build`, `lint`, `typecheck`, `test` (unit), `test:int`, `test:e2e`, `db:migrate`, `db:seed`, `compose:up/down`. `.nvmrc` = 22. Pin exact versions of Next.js 15.x, React 19.x, Fastify 5.x, Prisma 6.x, Vitest 3.x, Playwright 1.5x.
2. **`packages/config`.** `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: bundler`). ESLint flat config: `typescript-eslint` recommended-type-checked, `import/order`, `no-param-reassign`, `prefer-const`, max-lines 800 (warn at 400), max-lines-per-function 50 (warn). Prettier. Tailwind preset exporting the §16 tokens as theme values.
3. **`packages/shared`.**
   - `env.ts`: `apiEnvSchema`, `webEnvSchema` (Zod, `.strict()`); helper `loadEnv(schema)` that prints a readable list of missing/invalid keys and exits 1. Include `NODE_ENV`, `DATABASE_URL`, `VALKEY_URL`, `S3_ENDPOINT/S3_BUCKET_MEDIA/S3_BUCKET_IMPORTS/S3_ACCESS_KEY/S3_SECRET_KEY/S3_FORCE_PATH_STYLE`, `SMTP_URL`, `EMAIL_FROM`, `ENCRYPTION_KEY_B64`, `BLIND_INDEX_KEY_B64`, `JWT_ACTIVE_KID`, `JWT_KEYS_JSON`, `API_INTERNAL_URL`, `WEB_ORIGIN`, `REVALIDATE_SECRET`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `SHIPPING_ADAPTER=fake|shiprocket`, `SHIPROCKET_*`, `SENTRY_DSN?`, `RATE_LIMIT_MULTIPLIER?`.
   - `money/`: `type Paise = number & { __brand: 'Paise' }`, `paise(n)`, `rupeesToPaise('80.00')` (string in, no floats), `formatINR(paise)` → `₹1,23,456.00` with Indian grouping, `add/sub/mulQty` guarding integers.
   - `tax/split-gst.ts`: R9 rule. `splitGst({ pricePaise, ratePercent, destinationState }) → { taxablePaise, cgstPaise, sgstPaise, igstPaise }`. `ORIGIN_STATE = 'TN'`.
   - `constants/`: Indian states/UTs with GST codes; default HSN map (3307 agarbatti/dhoop, 2914 camphor, 3406 candles, 3303 perfumes …); courier domain allow-list; `FREE_SHIPPING_THRESHOLD_DEFAULT = 59900`.
   - `schemas/common.ts`: `pincodeSchema` (`^\d{6}$`), `phoneSchema` (`^[6-9]\d{9}$`), `slugSchema`, `emailSchema`, `quantitySchema` (1–20), `uuidSchema`.
   - `errors.ts`: `ErrorCode` union + `AppError` class `{ code, httpStatus, message, details? }`.
   - `brand.ts`: `{ name: 'Puja Essentials', tagline, logoKey: null }`.
4. **`apps/api`.**
   - `app.ts` exports `buildApp(opts: { env, ports })`: registers `fastify-type-provider-zod`, `@fastify/sensible`, `@fastify/helmet` (baseline; full CSP is the web app's job), request-id, pino logger with `redact` paths (`req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.otp`, `*.password`, `*.token`, `*.refreshToken`, `*.phone`, `*.line1`, `*.line2`) and a serializer that replaces `email` values with `sha256:<8 chars>`; error handler mapping `AppError`/Zod errors/unknown to the envelope (unknown → 500 `INTERNAL`, logged with request id, no stack in body).
   - Routes: `GET /healthz` (200 always), `GET /readyz` (checks ports: DB later via hook registry; for now Valkey ping + object storage head-bucket), `GET /metrics` (prom-client default + `http_request_duration_seconds` histogram).
   - `server.ts`: loads env, builds ports, listens on `0.0.0.0:${PORT}`; graceful shutdown.
   - Dockerfile: multi-stage, `node:22-alpine`, non-root user, `pnpm deploy --prod`, `HEALTHCHECK` on `/healthz`.
5. **Ports.** Interfaces are minimal and typed:
   - `EmailPort.send({ to, subject, html, text, headers? }) → { messageId }`
   - `ObjectStoragePort.presignPut({ bucket, key, contentType, maxBytes, expiresSec })`, `presignGet`, `head`, `delete`, `getStream`, `put`
   - `KeyProvider.encrypt(plain: string) → string (v1:iv:tag:cipher base64)`, `decrypt`, `blindIndex(value) → hex`
   - `ShippingPort.checkServiceability({ pincode, weightGrams }) → { serviceable, etaDays, ratePaise, courier }`, `createShipment`, `createReversePickup`, `track`
   - `SearchPort.search({ q, type?, limit }) → { products: [], categories: [] }`, `indexProduct`, `removeProduct`
   - Adapters: `SmtpEmailAdapter` (nodemailer from `SMTP_URL`), `S3ObjectStorageAdapter` (AWS SDK v3 `S3Client` + `@aws-sdk/s3-request-presigner`, `forcePathStyle` from env), `EnvKeyProvider` (AES-256-GCM, random 12-byte IV, versioned envelope string, constant-time tag check by the cipher; HMAC-SHA256 blind index with the second key), `FakeShippingAdapter` (PIN `6*` → serviceable 1–3 days ₹35, other serviceable by first digit table, `00*` unserviceable; AWB `FAKE-<uuid>`), `NoopSearchAdapter` (returns empty; replaced in plan 04).
   - `ports/index.ts`: `createPorts(env)` selecting adapters by env; `fastify.decorate('ports', ports)`.
6. **`apps/web`.** `create-next-app` equivalent with App Router, TypeScript, Tailwind; `next-intl` with `i18n.ts` (locales `['en']`, default `en`), `app/[locale]/layout.tsx` (html lang, fonts placeholder, tokens.css), `app/[locale]/page.tsx` ("Puja Essentials — coming soon" using tokens), `app/admin/layout.tsx` placeholder, `middleware.ts` (locale routing only), `app/api/healthz/route.ts`, `app/api/[...path]/route.ts` generic proxy to `API_INTERNAL_URL` (no auth yet; forwards method, body, query, selected headers; strips hop-by-hop), `styles/tokens.css` with every §16 token in light and dark, `next.config.ts` with `output: 'standalone'`, `images.remotePatterns` from env. Dockerfile standalone, non-root.
7. **Compose.** `postgres:16-alpine` (healthcheck `pg_isready`), `valkey/valkey:8-alpine`, `minio/minio` + one-shot `minio/mc` job creating buckets `media` (public-read off; served via presigned GET) and `imports`, `axllent/mailpit`. `docker-compose.e2e.yml` sets `NODE_ENV=test` and `RATE_LIMIT_MULTIPLIER=100`.
8. **Vitest.** Root `vitest.workspace.ts`; per-project configs with v8 coverage and thresholds (80 %; 95 % on `packages/shared/src/{money,tax}`). `apps/api/vitest.int.config.ts` with `globalSetup` in `test/helpers/containers.ts` starting Postgres (used from plan 02), Valkey and MinIO via Testcontainers and exporting URLs through env. `test/helpers/app.ts` builds the app with test env and real local adapters.
9. **CI.** `ci.yml` jobs per conventions §4 with `concurrency: cancel-in-progress`, pnpm cache, actions pinned by SHA; `security` job: Semgrep (`p/typescript`, `p/nodejs`, `p/owasp-top-ten`), gitleaks, `pnpm audit --audit-level=high`, Trivy `fs` and `image` on both built images. Required checks documented in README. Renovate config (weekly, group minor/patch, pin GitHub Actions). PR template with the global DoD. CODEOWNERS = repo owner.
10. **Docs.** README: prerequisites, `docker compose up -d`, `pnpm dev`, ports, how tests run, how to add an env var (schema + `.env.example`).

## 5. Contracts

- Envelope: `{ success: boolean, data: T | null, error: { code: string, message: string, details?: unknown } | null, meta?: { page, limit, total } }`.
- `AppError` codes seeded: `INTERNAL`, `VALIDATION`, `NOT_FOUND`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `CONFLICT`.
- Ports as in task 5; adapters chosen by env: `EMAIL_ADAPTER=smtp`, `STORAGE_ADAPTER=s3`, `KEY_PROVIDER=env`, `SHIPPING_ADAPTER=fake`, `SEARCH_ADAPTER=noop`.

## 6. Test plan

### Unit (`packages/shared`, `apps/api`)

- `money`: `rupeesToPaise` exact for `'80'`, `'80.5'`, `'80.55'`, rejects `'80.555'` and non-numeric; `formatINR` for 0, 999, 100000, 12345678 (Indian grouping `₹1,23,456.78`); arithmetic rejects non-integers.
- `splitGst`: table-driven over rates 5/12/18, prices 100, 8000, 9999, 100001 paise; TN vs `MH`; asserts `taxable + cgst + sgst + igst == price`, odd-paisa rule (CGST gets the extra paisa), exactly one pair non-zero. 100 % coverage.
- `schemas`: valid/invalid PIN, phone (leading 5 rejected), slug (uppercase, spaces, >120), quantity 0/21.
- `EnvKeyProvider`: roundtrip; different IV each call; tampered ciphertext throws; wrong key throws; `blindIndex` deterministic and differs per key.
- `FakeShippingAdapter`: serviceability table; deterministic AWB format.
- Error handler: `AppError` → mapped status/code; Zod error → 400 `VALIDATION` with field list; thrown `Error` → 500 `INTERNAL` without message leak.
- Logger redaction: log an object containing `authorization`, `otp`, `phone`, `email`; assert redacted/hashed in output.

### Integration (Testcontainers)

- `GET /healthz` 200; `GET /readyz` 200 with stack up; 503 when Valkey container stopped.
- `S3ObjectStorageAdapter` against MinIO: presigned PUT then `head` finds object with the fixed content type; presign with `maxBytes` rejects oversize PUT.
- `SmtpEmailAdapter` against Mailpit: send → Mailpit API lists the message with subject.
- `GET /metrics` exposes the histogram after a request.

### E2E

- None yet; `tests/e2e/smoke.spec.ts` placeholder that loads `/` and asserts the title (enabled in plan 18).

### Security

- `helmet` baseline headers present on API responses; error body never contains `stack`.

### Coverage targets

- `packages/shared`: 95 % (money/tax 100 %); `apps/api`: 80 %.

## 7. Definition of Done

Global DoD plus:

- [ ] `docker compose up -d && pnpm dev` serves web on 3000, API on 4000, Mailpit UI on 8025, MinIO console on 9001
- [ ] `pnpm test && pnpm test:int` green locally and in CI; coverage thresholds enforced (verify by temporarily deleting a test → build fails)
- [ ] Both Docker images build in CI and pass Trivy with no critical
- [ ] `.env.example` lists every key consumed by `env.ts`; app refuses to start with a missing key and names it
- [ ] Ports have no cloud-specific configuration outside adapters

## 8. Senior engineer review notes

- Keep DI boring: a `ports` object on the Fastify instance is enough; do not introduce a container library.
- `forcePathStyle` must be env-driven, not hard-coded, or S3 on AWS breaks in Phase 2.
- Pino `redact` cannot hash; use a custom serializer for `email` and keep the redact list for tokens. Test it — this is the control that prevents PII in logs later.
- Coverage thresholds belong in each project's config, not only the root, or per-package runs silently skip them.
- Do not add `@fastify/cors`: with the BFF (R1) the API is never called cross-origin by browsers. If a later plan needs it, that is a design change to discuss.
- Pin every action by SHA now; Renovate keeps them fresh. Unpinned actions are the most common supply-chain finding in VAPTs.
- Resist building a "base repository" abstraction in this plan; plan 02 defines data access with real models.
- The BFF proxy must not forward `cookie` headers to the API (the API is Bearer-only) and must strip `set-cookie` from API responses.

## 9. Implementation prompt

```
You are implementing plan P01 from docs/plans/01-foundation-monorepo-ci.md for the Puja Essentials e-commerce platform. Read docs/plans/00-README.md (conventions, review findings R1–R18) and DESIGN.md §4.1, §4.2, §5, §13, §16 first.

Deliver exactly the scope in P01 §2–§5: pnpm monorepo, packages/config, packages/shared (env schemas, Money, splitGst per R9, constants, common Zod schemas, error codes, brand), apps/api Fastify skeleton (app factory, redacting logger, error envelope, /healthz /readyz /metrics, Zod type provider, Dockerfile), the five ports with their local adapters (SMTP→Mailpit, S3→MinIO with env-driven forcePathStyle, EnvKeyProvider AES-256-GCM + HMAC blind index, FakeShippingAdapter, NoopSearchAdapter), apps/web Next.js 15 skeleton with app/[locale] (en only, next-intl), app/admin placeholder, generic BFF proxy route that never forwards cookies, tokens.css with every §16 token in light and dark, Dockerfiles, docker-compose.yml (postgres, valkey, minio + bucket init, mailpit) and docker-compose.e2e.yml, Vitest workspace with v8 coverage thresholds (80% default; 95% for shared money/tax), Testcontainers integration harness, and .github/workflows/ci.yml with lint, typecheck, unit, integration, build, security (Semgrep, gitleaks, pnpm audit high, Trivy) — all actions pinned by SHA — plus Renovate, PR template and CODEOWNERS.

Work test-first: write the unit tests in P01 §6 for money, splitGst, schemas, EnvKeyProvider, FakeShippingAdapter, the error handler and logger redaction before the implementations; then the integration tests for /readyz, the S3 adapter against MinIO and the SMTP adapter against Mailpit. Do not mock the containers.

Constraints: immutable data (no in-place mutation), files ≤ 400 lines, functions ≤ 50 lines, no comments explaining what code does, every config value from env validated by Zod, no cloud SDK used for configuration, no @fastify/cors. Pin dependency versions exactly.

When done: run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int`, build both Docker images, bring the compose stack up and show `curl localhost:4000/readyz`. Then complete the P01 Definition of Done checklist with evidence and stop for review.
```
