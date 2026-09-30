# Error Response Policy

Defines the HTTP status code and response shape for every security-relevant error category.

## Principles

1. **Never leak internal state.** Error responses contain `code` and `message` only — no stack traces, no Prisma model names, no SQL fragments, no file paths.
2. **Uniform shapes prevent enumeration.** IDOR and "not found" return identical 404 responses so an attacker cannot distinguish "resource doesn't exist" from "resource exists but belongs to another user."
3. **Codes are machine-readable.** Every error carries a `code` string (e.g. `RATE_LIMIT_EXCEEDED`) that clients can act on without parsing the message.

## Response Shape

All API errors follow this envelope:

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Not found"
}
```

Validation errors include a `details` array:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    { "path": ["email"], "message": "Invalid email address" }
  ]
}
```

## Status Code Policy

### 400 Bad Request

Returned when the request body, query string, or path parameter fails Zod schema validation. The `details` array lists each failing field.

**Codes:** `VALIDATION_ERROR`

**Never return:** the raw Zod error tree, the schema definition, or the field's current stored value.

### 401 Unauthorised

Returned when:
- No `Authorization: Bearer <token>` header is present on a protected route
- The token is expired, malformed, or signed with an unknown key
- The OTP verification fails (after consuming an attempt)

**Codes:** `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_OTP`

**Never return:** whether the email address exists.

### 403 Forbidden

Returned when the caller is authenticated but lacks the required role or step-up:
- A `CUSTOMER` token hits an `ADMIN`-only route
- A `STAFF` token hits an `ADMIN`-only route
- A valid access token hits a `stepUp: true` route without a recent MFA confirmation

**Codes:** `FORBIDDEN`, `STEP_UP_REQUIRED`, `REAUTH_REQUIRED`

**Never return:** the required role name or MFA method in the response body (return it only in the `WWW-Authenticate` header when applicable).

### 404 Not Found

Returned for both genuine missing resources **and** IDOR — when a resource exists but belongs to a different user. This prevents ownership enumeration.

**Codes:** `RESOURCE_NOT_FOUND`

**Rationale:** returning 403 on a cross-user access would confirm that the resource ID is valid and owned by someone. 404 gives no information.

**Never return:** `"this order belongs to a different user"` or similar.

### 409 Conflict

Returned when the request is structurally valid but conflicts with existing state (e.g. duplicate email on registration, coupon already applied).

**Codes:** `CONFLICT`, `DUPLICATE_EMAIL`, `COUPON_ALREADY_APPLIED`

### 410 Gone

Returned for one-time resources that have been consumed (e.g. OTP already used, email verification link clicked).

**Codes:** `RESOURCE_EXPIRED`

### 422 Unprocessable Entity

Returned when validation passes but business rules are violated (e.g. order total mismatch, insufficient stock).

**Codes:** `BUSINESS_RULE_VIOLATION`, `INSUFFICIENT_STOCK`, `PAYMENT_AMOUNT_MISMATCH`

### 429 Too Many Requests

Returned when a sliding-window rate limit is exceeded. Always includes `Retry-After` (seconds) and `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers.

**Codes:** `RATE_LIMIT_EXCEEDED`

**Never return:** the current counter value or the reset timestamp in the body (use headers only).

### 500 Internal Server Error

Returned for any unhandled exception. The response body is always a generic message; the full error is logged server-side with a correlation `requestId`.

**Codes:** `INTERNAL_ERROR`

**Never return:** stack trace, Prisma client error, database name, or SQL fragment.

## Stack Trace Policy

Stack traces are **never** serialised into API responses. The error handler in `app.ts` catches all unhandled errors and logs them with `logger.error({ err, requestId })` before returning a 500 with `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }`.

The `FORBIDDEN_RESPONSE_PATTERNS` list in `test/security/injection-corpus.test.ts` verifies this at the integration test level:

```ts
const FORBIDDEN_RESPONSE_PATTERNS = [
  /at \w+ \(.*:\d+:\d+\)/,   // stack frames
  /PrismaClient/,
  /SELECT .* FROM/i,
  /prisma\.\w+\.\w+/,
];
```

## Enumeration Hardening

| Scenario | Correct Status | Wrong Status |
|----------|---------------|--------------|
| Non-existent email on OTP send | 200 (silent acceptance) | 404 (leaks whether email exists) |
| Non-existent product slug | 404 | — |
| Valid product slug, wrong tenant | 404 | 403 (leaks existence) |
| Another user's order ID | 404 | 403 (leaks existence) |
| Admin route, no token | 401 | 403 (leaks route exists) |
| Admin route, customer token | 403 | 404 |

The OTP send endpoint always returns 200 whether or not the email is registered, to prevent email enumeration. The actual delivery (or non-delivery) is handled silently.
