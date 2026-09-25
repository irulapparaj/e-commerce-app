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
- Coverage: 80 % lines/branches/functions per package; 95 % for `packages/shared/src/{money,tax}` and, from later plans, `apps/api/src/modules/{auth,cart,orders,payments,tax}`.
- `NODE_ENV=test` unlocks `RATE_LIMIT_MULTIPLIER` and the fake email adapter; both are rejected at boot otherwise.

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
