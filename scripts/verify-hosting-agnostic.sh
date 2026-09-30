#!/usr/bin/env bash
# verify-hosting-agnostic.sh — P18 §9
# Verifies the codebase honours the hosting-agnostic rules from DESIGN.md §4.2:
#   1. No cloud SDK imports outside ports/adapters/
#   2. No process.env reads outside env.ts (shared package)
#   3. No NEXT_PUBLIC_ values that look like secrets
#   4. No hard-coded internal hostnames
#   5. .env.example keys match the schema exported by @pe/shared
#   6. Both Dockerfiles build with placeholder values (optional, skipped in --quick mode)
#
# Usage:
#   bash scripts/verify-hosting-agnostic.sh           # full checks
#   bash scripts/verify-hosting-agnostic.sh --quick   # skip Docker build

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

fail() {
  echo "  FAIL: $*" >&2
  FAILURES=$((FAILURES + 1))
}

pass() {
  echo "  PASS: $*"
}

header() {
  echo ""
  echo "── $* ──"
}

cd "$REPO_ROOT"

# ─── 1. No cloud SDK imports outside ports/adapters/ ─────────────────────────
header "1. Cloud SDK imports"

CLOUD_PATTERNS=(
  "@aws-sdk"
  "@google-cloud"
  "azure-"
  "firebase-admin"
  "@vercel/"
  "netlify-"
)

for pattern in "${CLOUD_PATTERNS[@]}"; do
  # Search everywhere except ports/adapters
  results=$(grep -r --include="*.ts" --include="*.js" -l "$pattern" \
    apps/api/src apps/web \
    --exclude-dir=adapters \
    --exclude-dir="node_modules" \
    --exclude-dir=".next" \
    2>/dev/null | grep -v 'ports/adapters' || true)

  if [[ -n "$results" ]]; then
    fail "Cloud SDK \"$pattern\" imported outside ports/adapters/:"
    echo "$results" | sed 's/^/    /'
  else
    pass "No \"$pattern\" outside ports/adapters/"
  fi
done

# ─── 2. No process.env reads outside env.ts ──────────────────────────────────
header "2. process.env reads"

ENV_FILES=(
  "packages/shared/src/env.ts"
  "apps/api/src/server.ts"
)

BAD=$(grep -r --include="*.ts" --include="*.js" \
  "process\.env\." \
  apps/api/src apps/web/app apps/web/lib \
  --exclude-dir="node_modules" \
  --exclude-dir=".next" \
  2>/dev/null | \
  grep -v "env\.ts\|env\.test\|\.spec\." | \
  grep -v "process\.env\.NODE_ENV" || true)

if [[ -n "$BAD" ]]; then
  fail "process.env reads outside env.ts:"
  echo "$BAD" | head -20 | sed 's/^/    /'
else
  pass "All process.env reads are confined to env.ts files"
fi

# ─── 3. No NEXT_PUBLIC_ values that look like secrets ────────────────────────
header "3. NEXT_PUBLIC_ secrets"

SECRET_NEXT_PUBLIC=$(grep -r "NEXT_PUBLIC_" \
  apps/web \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.env*" \
  --exclude-dir="node_modules" --exclude-dir=".next" \
  2>/dev/null | \
  grep -iE "secret|key|token|password|api_key|webhook" || true)

if [[ -n "$SECRET_NEXT_PUBLIC" ]]; then
  fail "NEXT_PUBLIC_ variable with secret-sounding name:"
  echo "$SECRET_NEXT_PUBLIC" | sed 's/^/    /'
else
  pass "No NEXT_PUBLIC_ secret leaks found"
fi

# ─── 4. No hard-coded internal hostnames ─────────────────────────────────────
header "4. Hard-coded hostnames"

HARDCODED=$(grep -rE \
  "(localhost|127\.0\.0\.1|0\.0\.0\.0|\.svc\.cluster\.local|\.internal|\.corp)" \
  apps/api/src apps/web/app apps/web/lib \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir="node_modules" --exclude-dir=".next" \
  2>/dev/null | \
  grep -v '^\s*//' | \
  grep -v ':[[:space:]]*\*[[:space:]]' | \
  grep -v "test\|spec\|example\|TODO\|FIXME\|env\.\|process\." | \
  grep -vE "^[^:]+\.test\.(ts|tsx):" || true)

if [[ -n "$HARDCODED" ]]; then
  fail "Hard-coded hostnames found (review each):"
  echo "$HARDCODED" | head -20 | sed 's/^/    /'
else
  pass "No hard-coded internal hostnames"
fi

# ─── 5. .env.example keys match shared env schema ────────────────────────────
header "5. .env.example completeness"

if [[ ! -f ".env.example" ]]; then
  fail ".env.example not found"
else
  # Extract keys from .env.example (lines like KEY=value or KEY=)
  EXAMPLE_KEYS=$(grep -E "^[A-Z][A-Z0-9_]+=" .env.example | cut -d= -f1 | sort)

  # Extract keys from shared env.ts (z.string(), z.url(), etc. schema fields)
  SCHEMA_KEYS=$(grep -oE "[A-Z][A-Z0-9_]+ *:" packages/shared/src/env.ts | \
    sed 's/ *://' | sort | uniq)

  MISSING_IN_EXAMPLE=$(comm -23 \
    <(echo "$SCHEMA_KEYS") \
    <(echo "$EXAMPLE_KEYS") || true)

  if [[ -n "$MISSING_IN_EXAMPLE" ]]; then
    fail "Schema keys missing from .env.example:"
    echo "$MISSING_IN_EXAMPLE" | sed 's/^/    /'
  else
    pass ".env.example covers all schema keys"
  fi
fi

# ─── 6. Docker builds (skipped in --quick mode) ──────────────────────────────
header "6. Docker builds"

if $QUICK; then
  echo "  SKIP (--quick mode)"
else
  echo "  Building api image…"
  if docker build -f apps/api/Dockerfile . -t pe-api-verify-check --quiet 2>&1 | tail -1; then
    pass "api Dockerfile builds"
    docker rmi pe-api-verify-check --force >/dev/null 2>&1 || true
  else
    fail "api Dockerfile build failed"
  fi

  echo "  Building web image…"
  if docker build -f apps/web/Dockerfile . -t pe-web-verify-check --quiet 2>&1 | tail -1; then
    pass "web Dockerfile builds"
    docker rmi pe-web-verify-check --force >/dev/null 2>&1 || true
  else
    fail "web Dockerfile build failed"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [[ $FAILURES -gt 0 ]]; then
  echo "verify-hosting-agnostic: $FAILURES failure(s) — fix before tagging v1.0.0-phase1" >&2
  exit 1
else
  echo "verify-hosting-agnostic: all checks passed ✓"
fi
