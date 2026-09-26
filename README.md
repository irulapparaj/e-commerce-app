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

| Command                            | What it does                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                         | Runs both apps with hot reload                                             |
| `pnpm lint` / `pnpm format:check`  | ESLint (type-aware) and Prettier                                           |
| `pnpm typecheck`                   | `tsc --noEmit` in every package                                            |
| `pnpm test`                        | Unit tests with v8 coverage (thresholds fail the build)                    |
| `pnpm test:int`                    | API integration tests on Testcontainers (Postgres, Valkey, MinIO, Mailpit) |
| `pnpm test:e2e`                    | Playwright (enabled in CI from plan P18)                                   |
| `pnpm build`                       | Production builds of both apps                                             |
| `pnpm db:migrate` / `pnpm db:seed` | Prisma migrations and seed                                                 |

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
