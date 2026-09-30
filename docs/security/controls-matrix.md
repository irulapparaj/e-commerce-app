# Security Controls Matrix

Maps DESIGN §11.6 control rows to current implementation status.

| Control | Category | Status | Implementation | Test |
|---------|----------|--------|---------------|------|
| OTP rate limit (5 sends/15min per email) | Authentication | ✅ Implemented | `plugins/rate-limiter.ts`; declared in route registry | `test/security/rate-limits.test.ts` |
| OTP rate limit (10 verifies/15min per email) | Authentication | ✅ Implemented | Sliding-window via Valkey | `test/security/rate-limits.test.ts` |
| OTP TTL 10 minutes | Authentication | ✅ Implemented | `otp.service.ts` — `createdAt + 10min` expiry check | `modules/auth/otp.service.ts` |
| RS256 JWT, 15min access TTL | Authentication | ✅ Implemented | `token.service.ts`; kid rotation | `modules/auth/token.service.test.ts` |
| Refresh token family invalidation | Authentication | ✅ Implemented | `token.service.ts` — `rotateRefresh` detects reuse | `modules/auth/token.service.test.ts` |
| TOTP MFA (HMAC-SHA1, 6-digit, 30s) | Authentication | ✅ Implemented | `totp.service.ts` via otplib | `modules/auth/otp.service.ts` |
| Boot-time secret assertions | Configuration | ✅ Implemented | `plugins/boot-assertions.ts`; 4 named error codes | `test/security/boot.test.ts` |
| RBAC via route registry | Authorization | ✅ Implemented | `security/route-registry.ts` + `plugins/auth.ts` guard | `test/security/rbac-matrix.test.ts` |
| IDOR — userId-scoped repositories | Authorization | ✅ Implemented | All user-owned resource queries scope to JWT userId | `test/security/idor-sweep.test.ts` |
| Mass assignment prevention | Authorization | ✅ Implemented | Zod `.strict()` on all route bodies | `test/security/mass-assignment.test.ts` |
| Webhook HMAC-SHA256 + 5min replay window | Integrity | ✅ Implemented | `modules/payments/webhook-verify.ts` | `test/security/webhooks-replay.test.ts` |
| Parameterised queries (no raw SQL) | Injection | ✅ Implemented | Prisma ORM; `no-raw-sql-untagged` Semgrep rule blocks bypass | `test/security/injection-corpus.test.ts` |
| XSS — sanitize-html on rich text write | Injection | ✅ Implemented | Allow-list applied in product/content write services | `test/security/injection-corpus.test.ts` |
| XSS — CSP nonce on storefront | Injection | ✅ Implemented | `apps/web/middleware.ts`; nonce injected per request | `test/security/injection-corpus.test.ts` |
| API security headers (HSTS, XCTO, XFO) | Transport | ✅ Implemented | `plugins/security-headers.ts` | `test/security/cookies.test.ts` |
| Storefront security headers | Transport | ✅ Implemented | `apps/web/lib/security-headers.ts` + middleware | `test/security/cookies.test.ts` |
| `Cache-Control: no-store` on auth responses | Transport | ✅ Implemented | `onSend` hook in `plugins/security-headers.ts` | — |
| HttpOnly Secure SameSite=Strict refresh cookie | Transport | ✅ Implemented | BFF sets cookie; API never emits Set-Cookie | `test/security/cookies.test.ts` |
| File upload — content-type allowlist | Input Validation | ✅ Implemented | Presign endpoint validates MIME type | `test/security/uploads.test.ts` |
| File upload — 5MB max, path traversal guard | Input Validation | ✅ Implemented | Presign endpoint validates size and key format | `test/security/uploads.test.ts` |
| Open redirect prevention | Input Validation | ✅ Implemented | BFF `next` param validated same-origin only | `test/security/redirects.test.ts` |
| Log redaction (OTP, tokens, keys) | Observability | ✅ Implemented | Pino redact list in `server.ts` | `test/security/redaction.test.ts` |
| No stack traces in error responses | Observability | ✅ Implemented | Error handler in `app.ts` serialises to `{code, message}` only | `test/security/redaction.test.ts` |
| Semgrep custom rules | SAST | ✅ Implemented | `.semgrep/` — 7 rules; CI `sast` job runs both community + custom | CI `sast` job |
| Gitleaks secret scanning | SAST | ✅ Implemented | `.gitleaks.toml`; CI `security` job | CI `security` job |
| pnpm audit (high+) | Dependency | ✅ Implemented | CI `security` job | CI `security` job |
| Trivy image scan (CRITICAL) | Container | ✅ Implemented | CI `security` job scans both pe-api and pe-web images | CI `security` job |
| ZAP baseline scan (storefront) | DAST | ✅ Implemented | CI `zap` job; `.zap/baseline.conf` + `.zap/allowlist.tsv` | CI `zap` job |
| Data encryption at rest (PII fields) | Data | ✅ Implemented | AES-256-GCM via `encryption.ts`; blind index for email lookup | `test/int/db/inventory-and-seed.test.ts` |
| Retention schedule — OTP 10min | Data | ✅ Implemented | OTP TTL enforced in otp.service; cleanup job TBD (P19) | — |
| Retention schedule — refresh 30d | Data | ✅ Implemented | `expiresAt` set on token creation; prune job TBD (P19) | — |
| Adaptive lockout | Authentication | ⏳ P19 | Deferred — see threat-model-walkthrough.md | — |
| Device-binding fingerprint | Authentication | ⏳ P19 | Deferred — requires "new device" UX flow | — |
| Structured audit log | Observability | ⏳ P19 | Deferred — full schema in P19 compliance work | — |
| Virus scan on upload | Input Validation | ⏳ P19 | Deferred — ClamAV sidecar not yet provisioned | — |
| Webhook idempotency dedup store | Integrity | ⏳ P19 | Deferred — payments module schema in P19 | — |

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ Implemented | Control is in production code, tested, and reviewed |
| ⏳ P19 | Accepted deferral; documented in threat-model-walkthrough.md |
| ❌ Gap | Control identified but not yet scheduled |
