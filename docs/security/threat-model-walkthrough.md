# Threat Model Walkthrough

Maps DESIGN §11.2 threat rows to implemented controls, covering tests, and residual risk deferred to P19.

## Threat Category Matrix

| # | Threat | STRIDE | Asset | Control | Test File | Residual / P19 |
|---|--------|--------|-------|---------|-----------|----------------|
| T1 | Account takeover via OTP brute-force | Tampering | User session | Sliding-window rate limit (5/15min on send-otp); OTP is 6-digit, 10min TTL | `test/security/rate-limits.test.ts` | Adaptive lockout (P19) |
| T2 | Session hijacking / token theft | Spoofing | Access token | RS256 JWT, 15min TTL; refresh in HttpOnly cookie (BFF); refresh family invalidation on reuse | `modules/auth/token.service.test.ts` | Device-binding fingerprint (P19) |
| T3 | Privilege escalation via forged JWT | Elevation of Privilege | RBAC | `kid` rotation; JWK Set fetched at boot; role claims verified server-side | `test/security/rbac-matrix.test.ts` | — |
| T4 | IDOR — accessing another user's order | Information Disclosure | Order data | `userId`-scoped repository queries; UUID opaque IDs; `getOrderForUser` enforces ownership | `test/security/idor-sweep.test.ts` | Ownership audit on bulk exports (P19) |
| T5 | Mass assignment — write role or price | Tampering | User/product | Zod `.strict()` on all route bodies; ADMIN_POLICIES enforced in route registry | `test/security/mass-assignment.test.ts` | — |
| T6 | SQLi via search or slug parameter | Tampering | Database | Prisma parameterised queries only; `.no-raw-sql-untagged` Semgrep rule blocks $queryRawUnsafe | `test/security/injection-corpus.test.ts` | — |
| T7 | Stored XSS via product description | Tampering | Storefront HTML | `sanitize-html` allow-list on write path; CSP with per-request nonce on read path | `test/security/injection-corpus.test.ts` | Rich-text editor hardening (P19) |
| T8 | Reflected XSS via search query | Tampering | Browser | CSP `script-src 'nonce-{n}'`; no dangerouslySetInnerHTML outside allow-list | `test/security/injection-corpus.test.ts` | — |
| T9 | Open redirect via `next` param | Tampering | Browser | BFF validates redirect target is same-origin; OPEN_REDIRECT_CORPUS test | `test/security/redirects.test.ts` | — |
| T10 | Path traversal in file download | Information Disclosure | Object storage | S3 key validated against UUID pattern; path segments rejected | `test/security/uploads.test.ts` | — |
| T11 | Webhook replay attack | Repudiation | Payment state | HMAC-SHA256 signature verified; 5min timestamp window enforced | `test/security/webhooks-replay.test.ts` | Idempotency key dedup store (P19) |
| T12 | Secret leakage via logs | Information Disclosure | Credentials | Pino redact list covers `password`, `otp`, `token`, `key`, `secret`; OTP never logged | `test/security/redaction.test.ts` | Structured audit trail (P19) |
| T13 | Insecure file upload (malware/SVG) | Tampering | Storage / users | Content-type allowlist (JPEG/PNG/WebP/PDF); SVG rejected; max 5MB; presign requires auth | `test/security/uploads.test.ts` | Virus scan on upload (P19) |
| T14 | Supply-chain compromise via npm | Tampering | Build artefact | `pnpm audit --audit-level=high` in CI; Trivy image scan (CRITICAL); lockfile committed | CI `security` job | Automated dependency PRs (P19) |
| T15 | Container escape / misconfigured image | Elevation of Privilege | Host | Non-root user in Dockerfile; read-only rootfs in compose; Trivy CRITICAL exit-1 | CI `security` job | — |
| T16 | Boot with insecure defaults | Tampering | All | `assertBootSafety` blocks start if FORBIDDEN_SECRET_VALUES or missing JWT kid | `test/security/boot.test.ts` | — |
| T17 | Clickjacking the checkout page | Spoofing | Payment | `X-Frame-Options: DENY`; CSP `frame-ancestors 'none'` | `test/security/cookies.test.ts` | — |
| T18 | Cookie theft via XSS | Information Disclosure | Refresh token | Refresh cookie is `HttpOnly; Secure; SameSite=Strict`; API never emits cookies | `test/security/cookies.test.ts` | — |

## Control Depth Notes

### Rate Limiting (T1)
Implemented as sliding-window counters in Valkey (Redis sorted sets). Keys are `rl:{action}:{identifier}` where identifier is email or IP. Window sizes and limits are declared in the route registry `rateLimit` field so CI can enforce them exist.

### JWT Rotation (T3)
`JWT_KEYS_JSON` holds an array of `{ kid, alg, privateKey, publicKey }`. The active kid is `JWT_ACTIVE_KID`. Old kids remain in the array for verification until all live tokens have expired (15min window). Boot assertion blocks start if `JWT_ACTIVE_KID` is not found in the array.

### IDOR (T4)
Every repository method that returns user-owned resources takes a mandatory `userId` parameter that is always sourced from the verified JWT claim, never from the request body or query string. Orders, addresses, and cart sessions all follow this pattern.

## Residual Risk Summary (Deferred to P19)

| Risk | Justification for Deferral |
|------|---------------------------|
| Adaptive lockout (beyond rate limit) | Requires ML signal on login patterns; V1 rate limit is sufficient for launch |
| Device-binding fingerprint | Needs UX design for "new device" notification flow |
| Bulk export ownership audit | Export feature not yet implemented |
| Webhook idempotency dedup | Requires persistent store schema; planned in P19 payments module |
| Virus scan on upload | Depends on ClamAV sidecar; infrastructure not yet provisioned |
| Automated dependency PRs | Renovate/Dependabot config; operational concern for P19 |
| Structured audit trail | Full audit log schema deferred to P19 compliance work |
| Rich-text editor hardening | No rich-text editor in V1; re-evaluate when CMS is introduced |
