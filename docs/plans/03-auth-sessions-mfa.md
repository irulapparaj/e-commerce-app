# P03 — Auth, sessions, MFA, BFF cookies

|                  |                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                 |
| Estimated effort | 6 dev-days                                                                                                                                           |
| Depends on       | P02                                                                                                                                                  |
| Unblocks         | P05, P08, P11, P12, P15                                                                                                                              |
| Design refs      | DESIGN.md §3 WF-05, §8 (auth column), §9 Auth, §11.2 (Authentication, Admin), §11.3 (Authentication and sessions, Admin hardening), R1, R3, R13, R15 |
| Branch           | `feat/p03-auth`                                                                                                                                      |

## 1. Goal

Passwordless email-OTP login for customers, OTP + mandatory TOTP for admin/staff, RS256 access tokens, rotating refresh-token families with reuse detection and per-audience TTLs, step-up re-authentication, and the BFF cookie layer in Next.js so server components and route handlers can authenticate without exposing tokens to JavaScript. Minimal functional login pages so the flow is end-to-end testable (visual polish is P09/P15).

## 2. Scope

### In

- API: OTP send/verify, refresh, logout, logout-all, me, MFA enrol/verify, step-up, sessions list/revoke; guards `authenticate`, `requireRole`, `requireMfaEnrolled`, `requireStepUp`; login hooks (`onLogin`) for cart merge (P11 subscribes)
- Rate limits for auth endpoints (Valkey sliding window) with `RATE_LIMIT_MULTIPLIER` under test only
- JWT key set with `kid` and rotation support; JWKS-style public keys exposed to the web app via env
- Web: BFF auth routes, generic proxy injecting Bearer, cookie policy, CSRF double-submit, `getSession()` for server components, `middleware.ts` route gating (R13), minimal `/login` and `/admin/login` pages
- OTP email through `EmailPort` with a minimal template (P13 replaces the template system)

### Out

- Staff invitation UI (P05; the API to create staff users is here), account security page UI (P15), customer disable (P08 uses `isDisabled`), cart merge implementation (P11)

## 3. Deliverables

```
apps/api/src/modules/auth/{routes.ts, otp.service.ts, token.service.ts, refresh.service.ts, mfa.service.ts, guards.ts, hooks.ts, redirect.ts, schemas.ts}
apps/api/src/plugins/{rate-limit.ts, auth.ts}
apps/api/src/modules/staff/{create-staff.ts}            # API only
apps/web/app/api/auth/{send-otp,verify-otp,mfa/verify,refresh,logout,logout-all,step-up}/route.ts
apps/web/app/api/[...path]/route.ts                      # now injects Bearer, handles 401→refresh→retry, CSRF
apps/web/lib/auth/{cookies.ts, csrf.ts, session.ts, jwt.ts}
apps/web/middleware.ts
apps/web/app/[locale]/login/page.tsx  apps/web/app/admin/login/page.tsx  (+ small client components)
apps/api/test/int/auth/*.test.ts  apps/api/test/security/auth/*.test.ts  tests/e2e/auth.spec.ts (enabled in P18)
```

## 4. Tasks (ordered)

1. **Keys.** `JWT_KEYS_JSON` = `[{ kid, privatePem, publicPem }]`, `JWT_ACTIVE_KID`. `token.service.ts` (using `jose`): `signAccess({ sub, role, aud: 'storefront'|'admin'|'mfa', amr?, stepUpExp? })` 15 min (`mfa` aud 5 min), `verifyAccess(token, { audience })` rejecting `alg != RS256`, unknown `kid`, wrong `aud`, expired. Public keys are also passed to the web app (`JWT_PUBLIC_KEYS_JSON`) for local verification.
2. **OTP.** `otp.service.ts`: `issue(email, ip)` → checks limits (3/10 min/email, 10/h/IP), generates `crypto.randomInt(0, 1_000_000)` zero-padded, `nonce = randomUUID()`, stores `otp:{emailHash}:{nonce}` = `{ hmac, attempts:0 }` TTL 600 s in Valkey, sends via `EmailPort` (`subject: "Your sign-in code"` — never contains the code; body contains it), returns `{ nonce }`. Response time padded to a constant minimum (e.g. 250 ms) and identical body whether or not the user exists. `verify(email, nonce, otp)`: fetch, `timingSafeEqual(hmac)`, increment attempts; 5 failures → delete key; success → delete key (single-use).
3. **Users on verify.** Find by email; create `CUSTOMER` if missing; if `isDisabled` → generic `INVALID_OTP` (no distinct error). For `ADMIN`/`STAFF`: if `mfaEnabled` → return `{ mfaRequired: true, mfaToken }` (aud `mfa`); if not enrolled → return `{ mfaEnrolmentRequired: true, mfaToken }` (enrolment allowed with this token only). For customers → issue session.
4. **Sessions.** `refresh.service.ts`: `issueSession(user, audience, meta)` → creates `RefreshToken` (random 32 bytes → base64url; store SHA-256; new `familyId`; `expiresAt` per audience; `lastUsedAt`), returns `{ accessToken, refreshToken, csrfToken (random 32 bytes), user }`. `rotate(rawToken)`: lookup by hash; if missing → `UNAUTHENTICATED`; if `revokedAt` set (reuse) → revoke whole family, log security event, `UNAUTHENTICATED`; if expired or idle-expired → revoke, `UNAUTHENTICATED`; else mark revoked, create the next token in the same family, return new pair. `revoke(rawToken)`, `revokeAll(userId)`, `listSessions(userId)`, `revokeSession(userId, id)`. Emits `hooks.onLogin({ userId, previousSessionId })` (P11 listens).
5. **MFA.** `mfa.service.ts` (`otplib`): `enrol(user)` → secret encrypted via `KeyProvider`, otpauth URL + QR data URL (`qrcode`), 10 recovery codes (random, shown once, stored as SHA-256); `verify(user, code)` accepts TOTP (window ±1) or an unused recovery code (consumed); on first successful verify set `mfaEnabled=true`. `POST /auth/mfa/verify` with an `mfa` token → full admin session (aud `admin`). `POST /auth/step-up` with a valid admin access token + TOTP → new access token with `amr: ['step-up']`, `stepUpExp = now + 5 min`. `requireStepUp` guard checks `amr` and `stepUpExp`.
6. **Guards.** `authenticate` (Bearer → `request.user`), `requireRole(...roles)`, `requireAudience('admin')`, `requireMfaEnrolled` (403 `MFA_ENROLMENT_REQUIRED` for admin/staff without `mfaEnabled` on every admin route except enrol/verify), `requireStepUp`. Reject disabled users on every authenticated request (cheap cached check, 60 s).
7. **Routes** per DESIGN §9 Auth + `GET/DELETE /account/sessions`. `POST /admin/staff` (ADMIN + step-up): create user with role, `mfaEnabled=false`, send invite email (minimal template). All bodies `.strict()` Zod.
8. **Rate-limit plugin.** Valkey sliding window keyed by route + identity (email hash / IP / user id); `RATE_LIMIT_MULTIPLIER` read only when `NODE_ENV=test`, else forced to 1 (boot assertion). Returns 429 `RATE_LIMITED` with `Retry-After`.
9. **Redirect validator.** `redirect.ts`: allow `^/(?!/)[A-Za-z0-9/_\-?=&.%]*$`, reject `//`, `\`, schemes, `@`; default `/account` (customer) or `/admin` (admin). Shared with the web app through `packages/shared`.
10. **Web BFF (R1).** `lib/auth/cookies.ts`: set/clear `__Host-access` (httpOnly, Secure outside development, SameSite=Lax, Path=/, maxAge 15 min), `__Host-refresh` (httpOnly, maxAge per audience), `__Host-csrf` (not httpOnly). `csrf.ts`: `assertSameOrigin(req)` (`Sec-Fetch-Site` in `same-origin|none` or `Origin === WEB_ORIGIN`) and `assertDoubleSubmit(req)` (`X-CSRF-Token` timing-safe equals cookie). Auth routes call the API server-to-server, then set cookies; API tokens never appear in response bodies to the browser. `[...path]` proxy: enforce CSRF on non-GET, inject Bearer from `__Host-access`, on 401 try one refresh (rotating cookies) then retry once, strip `cookie`/`set-cookie` both ways. `session.ts`: `getSession()` for server components verifies `__Host-access` locally with `jose` and the public keys (no network), returns `{ userId, role, aud, amr }` or null. `middleware.ts`: `/checkout`, `/account/**` need a valid storefront session else redirect to `/login?redirect=<validated path>`; `/admin/**` (except `/admin/login`) needs `aud=admin`.
11. **Minimal pages.** `/login`: email form → OTP form (6 boxes) → redirect; error messages generic. `/admin/login`: email → OTP → TOTP (or enrolment screen with QR + recovery codes on first login) → `/admin`. Use tokens.css classes only; no design work.
12. **Security events.** Log (structured, redacted) `auth.otp.issued`, `auth.login`, `auth.refresh.reuse_detected`, `auth.mfa.enrolled`, `auth.step_up`; counters on `/metrics`.

## 5. Contracts

- `POST /auth/send-otp { email } → 200 { nonce }` always (same shape/timing for unknown emails); 429 on limit.
- `POST /auth/verify-otp { email, nonce, otp } → 200 { accessToken, refreshToken, csrfToken, user }` | `{ mfaRequired: true, mfaToken }` | `{ mfaEnrolmentRequired: true, mfaToken }`; 401 `INVALID_OTP` for wrong/expired/disabled.
- `POST /auth/refresh { refreshToken } → 200 { accessToken, refreshToken, csrfToken }`; 401 on reuse/expiry (family revoked).
- Access token claims: `sub, role, aud, iat, exp, jti, kid(header), amr?, stepUpExp?`.
- `hooks.onLogin` payload `{ userId, previousSessionId: string | null }`.
- Web cookies as in task 10; API is never called with cookies.

## 6. Test plan

### Unit

- OTP format (6 digits, leading zeros), HMAC compare constant-time wrapper, attempts logic, single-use.
- Token sign/verify: happy path; rejects HS256-signed token with the public key as secret (alg confusion); unknown kid; wrong aud; expired; tampered signature; `stepUpExp` handling.
- Refresh rotation state machine (pure function over token record + now): valid → rotate; revoked → family revoke; expired/idle → revoke; audience TTLs.
- TOTP verify window; recovery code consumption; enrolment secret encrypted (assert ciphertext prefix).
- Redirect validator table (`/account`, `/checkout?x=1`, `//evil.com`, `/\evil`, `https://…`, `/a@b`, empty).
- CSRF helpers: `Sec-Fetch-Site: cross-site` rejected; missing header + wrong Origin rejected; double-submit mismatch rejected.

### Integration (Fastify inject + Valkey + Postgres; `FakeEmailAdapter` capturing sends)

- Full customer flow: send-otp → captured email contains code, subject does not → verify → tokens → `GET /auth/me`.
- Unknown email: identical response body and status; elapsed time ≥ padding; no user created until verify.
- Wrong OTP ×5 → sixth correct attempt fails (key deleted); new send works.
- Rate limits with multiplier 1: 4th send within 10 min → 429; 11th from same IP → 429.
- Disabled user → `INVALID_OTP`, no session.
- Refresh: rotate OK; reuse of the old token → 401 and the new token also revoked (family); `logout-all` revokes all families; idle expiry after `lastUsedAt` + 7 d (clock injected).
- Admin: verify-otp returns `mfaEnrolmentRequired` for seeded admin; enrol → verify → admin session (`aud=admin`); admin routes 403 `MFA_ENROLMENT_REQUIRED` before enrolment; storefront token rejected on admin routes; step-up token expires after 5 min (clock); `POST /admin/staff` requires step-up and creates a STAFF user + invite email.
- Audience TTLs: admin refresh `expiresAt` = 8 h, storefront 30 d.
- `hooks.onLogin` invoked with previous session id.

### Web (Vitest + `next/server` request mocks)

- BFF routes set exactly the three cookies with the specified attributes; proxy adds `Authorization` and strips `cookie`; 401 → refresh → retry once → then 401 clears cookies; CSRF rejection returns 403 before proxying; `getSession()` returns null on tampered cookie.

### E2E (Playwright, written now, enabled in P18)

- Customer logs in with OTP read from Mailpit API and lands on `/account`.
- Admin first login enrols TOTP (code generated with `otplib` from the displayed secret) and reaches `/admin`; second login requires TOTP.
- Visiting `/checkout` unauthenticated redirects to `/login?redirect=/checkout`; `redirect=//evil.com` is ignored.

### Security

- Cookie attribute assertions (`__Host-` prefix implies Path=/ and no Domain; Secure; HttpOnly where required).
- Enumeration: statistical timing test over 20 known/unknown emails (mean difference below padding jitter).
- No OTP value in any log line (capture logger output).
- JWT alg confusion and `kid` injection tests.

### Coverage targets

- `modules/auth/**`, `plugins/auth.ts`, `plugins/rate-limit.ts`: 95 %. `apps/web/lib/auth/**`: 90 %.

## 7. Definition of Done

Global DoD plus:

- [ ] All DESIGN §9 Auth endpoints implemented with `.strict()` schemas
- [ ] Cookies match §11.3 exactly (`__Host-`, Path=/, SameSite=Lax, HttpOnly on access/refresh, not on csrf)
- [ ] API responds 401 to any request carrying cookies but no Bearer (proves Bearer-only)
- [ ] Reuse detection demonstrated in a test that revokes the family
- [ ] Admin cannot reach any `/admin/*` API before MFA enrolment
- [ ] E2E specs written and passing locally against compose (CI enablement is P18)

## 8. Senior engineer review notes

- The single most common bug here is verifying the JWT with the wrong key on the web side. Ship the public keys as a JSON array with `kid`, and test rotation by signing with a second key.
- Never branch on "user exists" before the OTP is verified; create the user inside `verify`. The padding delay is a real control, not a nicety — keep it and test it.
- Store only hashes of refresh tokens and recovery codes. If you can read the token from the DB, so can an attacker with a backup.
- `mfa` tokens must be useless anywhere except `/auth/mfa/*`; enforce by audience, not by checking a flag.
- The proxy's refresh-on-401 must be single-flight per request; two parallel proxied calls both refreshing will trigger reuse detection and log the user out. Use a short lock in memory keyed by refresh cookie hash (or accept and document the race and let the client retry).
- `SameSite=Lax` plus Origin checks is enough for the BFF; do not add SameSite=Strict — it breaks the redirect back from Razorpay in P12.
- Keep the login pages functional and ugly; P09 will restyle. Do not let design discussions leak into this PR.
- `RATE_LIMIT_MULTIPLIER` must be read once at boot and the boot assertion must throw if it is set outside `NODE_ENV=test`.

## 9. Implementation prompt

```
You are implementing plan P03 from docs/plans/03-auth-sessions-mfa.md. Read docs/plans/00-README.md (R1, R3, R13, R15) and DESIGN.md §3 WF-05, §9 Auth, §11.3 "Authentication and sessions" and "Admin hardening" first. P01 and P02 are merged: use EmailPort (SMTP→Mailpit; FakeEmailAdapter in tests), KeyProvider, Valkey, the Prisma client with encryption, the rate-limit conventions and the test harness.

Deliver the API auth module (OTP issue/verify with CSPRNG codes, HMAC storage, 5-attempt single-use, padded uniform responses; RS256 access tokens via jose with kid rotation and audiences storefront/admin/mfa; refresh-token families with rotation, reuse detection, per-audience TTLs, logout/logout-all/sessions; TOTP MFA enrol/verify with encrypted secrets and hashed recovery codes; step-up with amr/stepUpExp; guards authenticate/requireRole/requireAudience/requireMfaEnrolled/requireStepUp; POST /admin/staff; Valkey sliding-window rate limits with RATE_LIMIT_MULTIPLIER honoured only under NODE_ENV=test; onLogin hook), and the Next.js BFF layer (auth route handlers that set __Host-access/__Host-refresh/__Host-csrf cookies exactly as specified, generic proxy injecting Bearer with single 401→refresh→retry and CSRF enforcement on non-GET, getSession() verifying locally with public keys, middleware gating /checkout, /account and /admin), plus minimal functional /login and /admin/login pages, and the Playwright specs in P03 §6 (they run locally now; CI wiring is P18).

Work test-first from P03 §6: unit tests for OTP, token verification (including alg confusion and kid injection), the refresh state machine, TOTP, redirect validator and CSRF helpers; then the integration tests (uniform-response timing, attempts, rate limits, reuse detection revoking the family, admin MFA enrolment gate, audience TTLs, step-up expiry) against real Valkey and Postgres. Do not mock the database or Valkey.

Constraints: immutable data, files ≤ 400 lines, functions ≤ 50 lines, .strict() Zod on every body, error codes from packages/shared/errors, no tokens in logs (add tests), the API must never read cookies, no @fastify/cors.

When done: run unit + integration suites, run the auth Playwright specs against `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up`, and complete the P03 Definition of Done with evidence. Stop for review.
```
