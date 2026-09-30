# P17 — Application security hardening & security test suite

|                  |                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Phase            | 1 — Code development                                                                                         |
| Estimated effort | 4 dev-days                                                                                                   |
| Depends on       | P03–P16 (everything application-level exists)                                                                |
| Unblocks         | P18                                                                                                          |
| Design refs      | DESIGN.md §11 (entire section, especially §11.3 and §11.6 left column), §11.4, §11.5 Phase 1 activities, R15 |
| Branch           | `feat/p17-security-hardening`                                                                                |

## 1. Goal

Turn the application-level security controls from "implemented somewhere" into "enforced, enumerated and continuously tested": finalise CSP and headers, audit every route against the rate-limit and RBAC tables, prove redaction and retention, add custom static-analysis rules that keep invariants from regressing, run a ZAP baseline in CI, and produce the threat-model walkthrough that P19's VAPT will start from.

## 2. Scope

### In

- CSP finalised for storefront and admin (nonce-based, enforce mode), full header set, cookie policy audit
- Route inventory tests generated from the Fastify route table: every route has auth class, RBAC expectation, rate limit, `.strict()` schema; mass-assignment and IDOR sweeps
- Injection corpus tests (SQLi/NoSQL-style/XSS/CSV/path/header/SSRF/open-redirect) against all inputs via schemas and behaviours
- Redaction audit (capture logs across a full E2E-style flow and scan), retention job completeness (§11.3 schedule), security counters completeness on `/admin/security`
- Boot assertions: no default secrets, test stubs absent, `RATE_LIMIT_MULTIPLIER` ignored, HTTPS-only cookies outside development
- Custom Semgrep rules; gitleaks config; dependency policy; `pnpm audit` gate
- ZAP baseline scan in CI against the compose stack (authenticated context), allow-list file
- `docs/security/threat-model-walkthrough.md` mapping §11.2 rows → controls → tests; `docs/security/controls-matrix.md`
- Error handling review: no stack traces/internal ids, uniform 404 vs 403 policy

### Out

- Platform controls (P19), VAPT itself (P19), CSP style hashes (P27)

## 3. Deliverables

```
apps/web/lib/security-headers.ts (finalised)  apps/web/middleware.ts (headers for all routes)
apps/api/src/plugins/{security-headers.ts, boot-assertions.ts}
apps/api/test/security/{routes-inventory.test.ts, rbac-matrix.test.ts, rate-limits.test.ts, idor-sweep.test.ts, mass-assignment.test.ts, injection-corpus.test.ts, redaction.test.ts, cookies.test.ts, webhooks-replay.test.ts, uploads.test.ts, redirects.test.ts, boot.test.ts}
apps/api/test/security/corpus/{xss.txt, sqli.txt, path.txt, header.txt, urls.txt}
apps/api/src/security/{route-registry.ts}            # declarative per-route metadata used by tests and guards
.semgrep/{no-direct-stock-update.yml, no-raw-sql-untagged.yml, no-dangerous-html.yml, no-console.yml, no-next-public-secrets.yml, no-cookie-read-in-api.yml, strict-zod.yml}
.gitleaks.toml  .zap/{baseline.conf, context.yaml, allowlist.tsv}
.github/workflows/ci.yml (+ zap job)
docs/security/{threat-model-walkthrough.md, controls-matrix.md, error-policy.md}
```

## 4. Tasks (ordered)

1. **Route registry.** `route-registry.ts`: every API route declares `{ method, path, auth: 'public'|'user'|'admin', roles?, stepUp?: boolean, rateLimit: { key, max, windowSec }, schema: ZodType }` at registration (a thin wrapper around `fastify.route`). A test walks `fastify.printRoutes()` and fails on any route not in the registry (so nothing ships undeclared).
2. **Headers.** Finalise `security-headers.ts`: storefront CSP `default-src 'self'; script-src 'self' 'nonce-…' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com; img-src 'self' data: <MEDIA_PUBLIC_BASE_URL>; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`; admin CSP without Razorpay; both add HSTS (`max-age=31536000; includeSubDomains; preload` — emitted always; effective only over HTTPS), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`. API: helmet equivalents + `Cache-Control: no-store` on all authenticated responses. Verify no inline scripts without nonce (test renders key pages and checks every `<script>`).
3. **Cookies audit.** Test every `Set-Cookie` the BFF emits: names, prefixes, `HttpOnly`, `Secure` (outside development), `SameSite=Lax`, `Path=/`, `Max-Age` per audience; API never sets cookies (assert across the route inventory).
4. **RBAC & rate-limit matrices.** Generated from the registry: for each route, call as anonymous / customer / STAFF / ADMIN (± step-up) and assert the declared outcome; for each route with a limit, exceed it with multiplier 1 and assert 429 + `Retry-After`. Compare declared limits with DESIGN §11.3's table (snapshot test).
5. **IDOR & mass assignment.** For every `user`-scoped route with an id param, create two users and assert cross-access → 404; for every route with a body schema, send the schema's valid sample plus `{ role:'ADMIN', price: 1, stock: 999, userId, isDisabled:false }` and assert 400 (`.strict()`), plus a scan that no schema uses `.passthrough()`.
6. **Injection corpus.** Payload files (OWASP-derived) fed to every string field of every schema and to query params: assert 400 or safe echo (React-escaped) — never 500; for slugs/ids assert 404/400; SQL error strings never appear in responses; path payloads on media keys and file names rejected; header payloads in `to`/`subject`/redirect rejected; SSRF: courier/tracking URL builders and any URL-accepting field rejected for non-allow-listed hosts; open redirect corpus on `redirect` param.
7. **Webhook replay & uploads.** Replay every fixture twice → single processing; tamper one byte → 401; uploads: polyglots, oversize, wrong type, SVG, double extension, path traversal in requested keys → rejected (reuse P04/P22 fixtures).
8. **Redaction & retention.** Run a scripted flow (login, checkout via stub, admin reveal, export) with a capturing logger; scan all log lines for emails (unhashed), 10-digit phones, OTP codes, tokens, signatures, address lines → none. Retention: assert a job exists for each §11.3 retention row (OTP 10 min via TTL, refresh 30 d, logs 90 d (documented as platform), audit 3 y (documented), orders 8 y (never deleted), guest carts 7 d TTL, import files 30 d, exports 24 h, return photos 1 y (P22 adds)) with a table test over the retention job's rule list.
9. **Boot assertions.** `boot-assertions.ts`: refuse to start if any secret equals a known default/placeholder (`changeme`, `test`, empty), if `NODE_ENV=production` and cookies are not `Secure`, if test stub modules are loaded, if `RATE_LIMIT_MULTIPLIER` is set outside test, if `JWT_ACTIVE_KID` is missing from `JWT_KEYS_JSON`. Tests boot the app with each bad config and expect a named error.
10. **Static analysis.** Semgrep custom rules: direct writes to `variant.stock` outside `applyMovement`; `$queryRawUnsafe`/string-built SQL; `dangerouslySetInnerHTML` outside the allow-listed components; `console.log`; `NEXT_PUBLIC_*` referencing secret-like names; `request.cookies` in `apps/api`; Zod objects without `.strict()` in route schemas. gitleaks config with the repo's test-secret allow-list. CI `security` job runs them; failures block.
11. **ZAP baseline.** `.zap/context.yaml` with a customer session (login via the OTP hook in test mode) and the storefront + BFF in scope (API is private); `zap-baseline.py` against the compose stack in CI (`e2e` job dependency), `allowlist.tsv` for accepted findings with justification (e.g. `unsafe-inline` styles). Fails on Medium+ not allow-listed.
12. **Error policy.** `docs/security/error-policy.md`: 404 for unauthorised access to user-scoped resources, 403 only for role/step-up on admin routes, generic `INVALID_OTP`, uniform validation errors; test that no response body contains `stack`, `prisma`, `at ` frames, or table names.
13. **Threat-model walkthrough.** `threat-model-walkthrough.md`: for each §11.2 row, the implemented controls (file/route), the tests that prove them (test names), and residual risk for P19 (platform). `controls-matrix.md`: §11.6 left column → status. Reviewed together with the code owner before P18.

## 5. Contracts

- `route-registry` metadata is mandatory for every route; tests fail on omission.
- Rate-limit table in the registry must equal DESIGN §11.3 values (snapshot).
- ZAP allow-list entries require a justification column and an owner.
- Boot assertion error codes: `BOOT_DEFAULT_SECRET`, `BOOT_INSECURE_COOKIES`, `BOOT_TEST_STUB_LOADED`, `BOOT_RATE_LIMIT_MULTIPLIER`, `BOOT_JWT_KID`.

## 6. Test plan

This plan _is_ a test plan; the deliverables in §3 are the tests. Additional acceptance:

- CI `security` job runs Semgrep custom rules + gitleaks + audit + Trivy and is required; the ZAP job runs on PRs touching `apps/**`.
- Mutation check: intentionally introduce (in a throwaway branch) a direct stock write, an unscoped order query, a missing `.strict()`, and an unregistered route — each must fail CI. Record the four failing runs in the PR.

### Coverage targets

- Security suite is excluded from coverage thresholds but must run in < 10 min in CI.

## 7. Definition of Done

Global DoD plus:

- [ ] Route inventory test passes with 100 % of routes declared
- [ ] RBAC, rate-limit, IDOR, mass-assignment, injection, replay, upload, redaction, cookie and boot suites green
- [ ] Headers/CSP verified on storefront, admin and API; no un-nonced inline scripts
- [ ] Semgrep rules block the four mutation cases (evidence in PR)
- [ ] ZAP baseline green with a justified allow-list
- [ ] Threat-model walkthrough and controls matrix reviewed and linked from DESIGN.md §11.5

## 8. Senior engineer review notes

- The route registry is the keystone: it converts "we think every route is protected" into a failing test when someone forgets. Keep it declarative and boring.
- Generated matrix tests are slow if naive; run them against one booted app with truncation between cases, not one app per case.
- CSP in enforce mode from day one on compose surfaces violations early; do not ship report-only "to be safe" — nobody reads the reports.
- HSTS preload is emitted by the app but only meaningful once TLS exists (P19); document that P19 must submit the domain to the preload list only after confirming all subdomains are HTTPS.
- The redaction test must exercise real flows, not unit-level serializers — leaks come from ad-hoc `logger.info(order)` calls in business code.
- Keep ZAP scoped to the web origin; scanning the private API directly produces noise about missing browser headers that do not apply.
- Resist fixing VAPT-style findings speculatively; the walkthrough doc is the input for the real test in P19.

## 9. Implementation prompt

```
You are implementing plan P17 from docs/plans/17-application-security-hardening.md. Read DESIGN.md §11 in full (§11.2 threat model, §11.3 controls, §11.6 code-vs-platform) and docs/plans/00-README.md (R15). P03–P16 are merged; this plan adds no product features.

Deliver: a declarative route registry that every API route must use (auth class, roles, step-up, rate limit, strict schema) with a test that fails on undeclared routes; finalised storefront/admin CSP and the full header set with a no-un-nonced-inline-script test; a cookie audit test; generated RBAC and rate-limit matrix tests compared against DESIGN §11.3; IDOR and mass-assignment sweeps; an injection corpus (XSS, SQLi, path, header, SSRF/URL, open redirect) applied to every schema field and query param asserting 400/404/safe-echo and never 500; webhook replay/tamper and upload polyglot tests; a flow-level log redaction test; a retention-rule table test; boot assertions with named error codes; custom Semgrep rules (no direct variant.stock writes, no untagged raw SQL, no dangerouslySetInnerHTML outside allow-listed components, no console.log, no NEXT_PUBLIC secrets, no cookie reads in the API, .strict() on route schemas) and gitleaks config wired into CI; a ZAP baseline job with an authenticated context and a justified allow-list; docs/security/threat-model-walkthrough.md, controls-matrix.md and error-policy.md.

Order of work: route registry and its inventory test first (it drives everything else), then headers/cookies, then the generated matrices, then corpus/replay/uploads, then redaction/retention/boot, then static analysis and ZAP, then the docs. Prove the Semgrep rules by creating a throwaway branch with the four violations in P17 §6 and attaching the failing CI runs.

Constraints: fix real findings in their modules (small PRs referencing this plan) rather than weakening tests; never lower coverage thresholds; ZAP allow-list entries need justification and owner; immutable data, files ≤ 400 lines.

When done: CI green including the new security and ZAP jobs, docs reviewed with the code owner, complete the P17 Definition of Done with evidence, and stop for review.
```
