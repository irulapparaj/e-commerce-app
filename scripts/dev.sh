#!/usr/bin/env bash
# dev.sh — start, stop, restart, and inspect the Puja Essentials dev stack
#
# Uses Homebrew-installed services (no Docker required):
#   postgresql@16, valkey, minio, mailpit
#
# Usage:
#   ./scripts/dev.sh start         Start everything (infra + API + web)
#   ./scripts/dev.sh stop          Stop API & web (keeps infra running)
#   ./scripts/dev.sh stop all      Stop API, web, AND all infra services
#   ./scripts/dev.sh restart       stop then start
#   ./scripts/dev.sh status        Show what is running + URLs
#   ./scripts/dev.sh logs          Tail both API and web logs interleaved
#   ./scripts/dev.sh logs api      Tail API log only
#   ./scripts/dev.sh logs web      Tail web log only
#   ./scripts/dev.sh infra start   Start Postgres/Valkey/MinIO/Mailpit only
#   ./scripts/dev.sh infra stop    Stop infra only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$ROOT/.dev-stack"   # runtime data: pgdata, miniodata, pids, logs
LOG_DIR="$STACK_DIR/logs"
PID_DIR="$STACK_DIR/pids"
ENV_FILE="$ROOT/.env"

# ── service ports (all non-default to avoid clashing with any system services)
PG_PORT=5432
PG_DATA="$STACK_DIR/pgdata"
PG_USER="${POSTGRES_USER:-pe}"
PG_DB="${POSTGRES_DB:-pe}"

VALKEY_PORT=6379

MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_DATA="$STACK_DIR/miniodata"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

MAILPIT_SMTP_PORT=1025
MAILPIT_HTTP_PORT=8025

API_PORT=4000
WEB_PORT=3000

# ── pid files
PG_PID="$PID_DIR/postgres.pid"
VALKEY_PID="$PID_DIR/valkey.pid"
MINIO_PID="$PID_DIR/minio.pid"
MAILPIT_PID="$PID_DIR/mailpit.pid"
API_PID="$PID_DIR/api.pid"
WEB_PID="$PID_DIR/web.pid"

# ── log files
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
PG_LOG="$LOG_DIR/postgres.log"
VALKEY_LOG="$LOG_DIR/valkey.log"
MINIO_LOG="$LOG_DIR/minio.log"
MAILPIT_LOG="$LOG_DIR/mailpit.log"

# ── colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▸${RESET} $*"; }
ok()      { echo -e "${GREEN}✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}!${RESET} $*"; }
err()     { echo -e "${RED}✗${RESET} $*" >&2; }
heading() { echo -e "\n${BOLD}$*${RESET}"; }

# ─── low-level helpers ────────────────────────────────────────────────────────
pid_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

port_open() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null
}

wait_for_port() {
  local port="$1" label="$2" timeout="${3:-30}"
  local i=0
  printf "  waiting for %s on :%s " "$label" "$port"
  while ! port_open "$port"; do
    (( i++ )) || true
    if (( i >= timeout )); then
      echo
      err "$label did not open port $port after ${timeout}s"
      return 1
    fi
    sleep 1
    printf '.'
  done
  echo
  ok "$label is up on :$port"
}

stop_pid() {
  local pid_file="$1" label="$2"
  if pid_alive "$pid_file"; then
    local pid; pid=$(cat "$pid_file")
    # Kill the process and all its children (macOS: use pkill -P then kill)
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    local i=0
    while pid_alive "$pid_file" && (( i < 10 )); do sleep 0.5; (( i++ )) || true; done
    if pid_alive "$pid_file"; then
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$(cat "$pid_file")" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    ok "Stopped $label"
  else
    rm -f "$pid_file"
    warn "$label was not running"
  fi
}

ensure_dirs() {
  mkdir -p "$LOG_DIR" "$PID_DIR" "$MINIO_DATA"
}

# ─── env setup ───────────────────────────────────────────────────────────────
ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    heading "Generating .env with fresh crypto keys..."
    node "$ROOT/scripts/generate-dev-env.mjs" "$ENV_FILE"
    ok "Created $ENV_FILE"
    warn "Razorpay keys are stubs. Payments use the in-process test stub (NODE_ENV=development)."
  fi

  # Next.js reads from apps/web/.env.local; sync the web-specific keys from the root .env
  local WEB_ENV="$ROOT/apps/web/.env.local"
  node -e "
const fs = require('fs');
const root = fs.readFileSync('$ENV_FILE', 'utf8');
const needed = new Set(['API_INTERNAL_URL','WEB_ORIGIN','REVALIDATE_SECRET','JWT_PUBLIC_KEYS_JSON','NEXT_PUBLIC_MEDIA_HOST','NEXT_PUBLIC_RAZORPAY_KEY_ID']);
const lines = root.split('\n').filter(l => { const m = /^([A-Z0-9_]+)=/.exec(l); return m && needed.has(m[1]); });
fs.writeFileSync('$WEB_ENV', lines.join('\n') + '\n', { mode: 0o600 });
" 2>/dev/null && ok "Synced apps/web/.env.local" || warn "Could not sync apps/web/.env.local"
}

# ─── infra: Postgres ─────────────────────────────────────────────────────────
start_postgres() {
  if port_open "$PG_PORT"; then
    ok "Postgres already running on :$PG_PORT"
    return 0
  fi

  info "Starting Postgres (port $PG_PORT)..."

  # Initialise cluster if not yet done
  if [[ ! -d "$PG_DATA/global" ]]; then
    info "Initialising Postgres cluster at $PG_DATA..."
    initdb -D "$PG_DATA" -U "$PG_USER" -E UTF8 --auth=trust -A trust \
      > "$PG_LOG" 2>&1
  fi

  # Start with unix socket disabled to avoid long-path issues on macOS
  # pg_ctl manages its own daemon — we just wait for the port
  pg_ctl start -D "$PG_DATA" \
    -o "-p $PG_PORT -c listen_addresses=localhost -c unix_socket_directories=''" \
    -l "$PG_LOG" -w
  # Record the postgres postmaster PID for stop_pid bookkeeping
  local pg_postmaster="$PG_DATA/postmaster.pid"
  if [[ -f "$pg_postmaster" ]]; then
    head -1 "$pg_postmaster" > "$PG_PID"
  fi
  wait_for_port "$PG_PORT" "Postgres" 30

  # Create the database if it does not exist yet
  psql -h localhost -p "$PG_PORT" -U "$PG_USER" -d postgres \
    -c "CREATE DATABASE $PG_DB;" 2>/dev/null || true
  # Enable pg_trgm (required for full-text search)
  psql -h localhost -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" \
    -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" > /dev/null 2>&1 || true
  ok "Database '$PG_DB' ready"
}

stop_postgres() {
  if port_open "$PG_PORT"; then
    info "Stopping Postgres..."
    pg_ctl stop -D "$PG_DATA" -m fast >> "$PG_LOG" 2>&1 || true
    rm -f "$PG_PID"
    ok "Postgres stopped"
  else
    warn "Postgres was not running"
  fi
}

# ─── infra: Valkey ────────────────────────────────────────────────────────────
start_valkey() {
  if port_open "$VALKEY_PORT"; then
    ok "Valkey already running on :$VALKEY_PORT"
    return 0
  fi
  info "Starting Valkey (port $VALKEY_PORT)..."
  nohup valkey-server \
    --port "$VALKEY_PORT" \
    --save "" \
    --appendonly no \
    --loglevel warning \
    >> "$VALKEY_LOG" 2>&1 &
  echo $! > "$VALKEY_PID"
  wait_for_port "$VALKEY_PORT" "Valkey" 20
}

stop_valkey() {
  stop_pid "$VALKEY_PID" "Valkey"
  # Belt + suspenders — also tell a running server to shutdown
  valkey-cli -p "$VALKEY_PORT" shutdown nosave 2>/dev/null || true
}

# ─── infra: MinIO ─────────────────────────────────────────────────────────────
start_minio() {
  if port_open "$MINIO_PORT"; then
    ok "MinIO already running on :$MINIO_PORT"
    return 0
  fi
  info "Starting MinIO (port $MINIO_PORT)..."
  MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  nohup minio server "$MINIO_DATA" \
    --address "127.0.0.1:$MINIO_PORT" \
    --console-address "127.0.0.1:$MINIO_CONSOLE_PORT" \
    >> "$MINIO_LOG" 2>&1 &
  echo $! > "$MINIO_PID"
  wait_for_port "$MINIO_PORT" "MinIO" 30

  # Create required buckets using available tool (mc → aws → node SDK shim)
  if command -v mc &>/dev/null; then
    mc alias set localdev "http://127.0.0.1:$MINIO_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" \
      > /dev/null 2>&1
    mc mb --ignore-existing localdev/media localdev/imports > /dev/null 2>&1
    mc anonymous set download localdev/media > /dev/null 2>&1
    ok "Buckets: media (public), imports (private)"
  elif command -v aws &>/dev/null; then
    AWS_ACCESS_KEY_ID="$MINIO_ROOT_USER" AWS_SECRET_ACCESS_KEY="$MINIO_ROOT_PASSWORD" \
      aws --endpoint-url "http://127.0.0.1:$MINIO_PORT" s3 mb s3://media --region ap-south-1 > /dev/null 2>&1 || true
    AWS_ACCESS_KEY_ID="$MINIO_ROOT_USER" AWS_SECRET_ACCESS_KEY="$MINIO_ROOT_PASSWORD" \
      aws --endpoint-url "http://127.0.0.1:$MINIO_PORT" s3 mb s3://imports --region ap-south-1 > /dev/null 2>&1 || true
    ok "Buckets: media, imports (via aws cli)"
  else
    # Fallback: use the project's pnpm-installed AWS SDK
    local s3_sdk
    s3_sdk=$(find "$ROOT/node_modules/.pnpm" -path "*/@aws-sdk/client-s3" -type d 2>/dev/null | head -1)
    if [[ -n "$s3_sdk" ]]; then
      node -e "
const {S3Client,CreateBucketCommand,PutBucketPolicyCommand}=require('$s3_sdk');
const c=new S3Client({endpoint:'http://127.0.0.1:$MINIO_PORT',region:'ap-south-1',credentials:{accessKeyId:'$MINIO_ROOT_USER',secretAccessKey:'$MINIO_ROOT_PASSWORD'},forcePathStyle:true});
(async()=>{
  for(const B of['media','imports']){try{await c.send(new CreateBucketCommand({Bucket:B}));}catch(e){if(!e.name.includes('AlreadyExist'))console.error(B,e.message);}}
  await c.send(new PutBucketPolicyCommand({Bucket:'media',Policy:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:'*',Action:'s3:GetObject',Resource:'arn:aws:s3:::media/*'}]})})).catch(()=>{});
})().catch(console.error)" > /dev/null 2>&1
      ok "Buckets: media (public), imports (via node SDK)"
    else
      warn "No S3 client found — buckets will be auto-created by the API on first media upload"
    fi
  fi
}

stop_minio() {
  stop_pid "$MINIO_PID" "MinIO"
}

# ─── infra: Mailpit ───────────────────────────────────────────────────────────
start_mailpit() {
  if port_open "$MAILPIT_HTTP_PORT"; then
    ok "Mailpit already running on :$MAILPIT_HTTP_PORT"
    return 0
  fi
  info "Starting Mailpit (SMTP :$MAILPIT_SMTP_PORT, HTTP :$MAILPIT_HTTP_PORT)..."
  nohup mailpit \
    --smtp "127.0.0.1:$MAILPIT_SMTP_PORT" \
    --listen "127.0.0.1:$MAILPIT_HTTP_PORT" \
    >> "$MAILPIT_LOG" 2>&1 &
  echo $! > "$MAILPIT_PID"
  wait_for_port "$MAILPIT_HTTP_PORT" "Mailpit" 20
}

stop_mailpit() {
  stop_pid "$MAILPIT_PID" "Mailpit"
}

# ─── database migration & seed ───────────────────────────────────────────────
migrate_and_seed() {
  heading "Running database migrations..."
  # Pass the DATABASE_URL to the prisma command via the .env file
  (cd "$ROOT" && pnpm --filter @pe/api db:migrate)
  ok "Migrations applied"

  local seeded_marker="$STACK_DIR/.seeded"
  if [[ ! -f "$seeded_marker" ]]; then
    heading "Seeding database (first run only)..."
    (cd "$ROOT" && pnpm --filter @pe/api db:seed) && touch "$seeded_marker"
    ok "Database seeded"
  fi
}

# Upload 1×1 placeholder WebP/AVIF derivatives to MinIO for every seeded product.
# Only runs once per stack-data directory; re-run by deleting .media-seeded.
# Never overwrites existing objects, so real photos (seed:images) survive a re-run.
seed_media_images() {
  local media_marker="$STACK_DIR/.media-seeded"
  [[ -f "$media_marker" ]] && return 0

  local s3_pkg
  s3_pkg=$(find "$ROOT/node_modules/.pnpm" -path "*/@aws-sdk/client-s3" -maxdepth 6 -type d 2>/dev/null | head -1)
  if [[ -z "$s3_pkg" ]]; then
    warn "AWS SDK not found — skipping media image seed (run 'pnpm install' first)"
    return 0
  fi

  heading "Seeding placeholder product images into MinIO..."
  node -e "
const {S3Client,PutObjectCommand,HeadObjectCommand}=require('$s3_pkg/dist-cjs/index.js');
const WEBP=Buffer.from('UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/gHOAAA=','base64');
const AVIF=Buffer.from('AAAAHGZ0eXBtaWYxAAAAAG1pZjFhdmlmAAAADW1ldGEAAAAAAAAADmhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABUAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBhc3AAAAAAAAAAAAAADHBpeGkAAAAAAwgICAAAAAxhdjFDAQAAAAAAAAAOcG9zcAAAAAAAAAAAAAAAABptZGF0AAAB0g==','base64');
const KEYS=['bambooless-sandal-agarbatti','brass-kapur-dani','chandan-wet-dhoop','citronella-mosquito-repellent-agarbatti','cotton-puja-wicks','flora-jasmine-agarbatti','gangajal-500-ml','guggal-dhoop-sticks','hawan-samagri-mix','lavender-perfume-dhoop','lemongrass-aroma-oil','loban-dhoop-stick-jar','long-garden-rose-agarbatti','lotus-backflow-incense-burner','masala-dhoop-cones','mogra-car-diffuser','oudh-bakhoor-bricks','premium-oudh-agarbatti-pouch','pure-camphor-tablets','rose-attar','royale-masala-agarbatti','sambrani-hawan-cups','sandalwood-reed-diffuser','vanilla-scented-candle'];
const s3=new S3Client({endpoint:'http://127.0.0.1:$MINIO_PORT',region:'ap-south-1',credentials:{accessKeyId:'$MINIO_ROOT_USER',secretAccessKey:'$MINIO_ROOT_PASSWORD'},forcePathStyle:true});
(async()=>{
  let n=0,kept=0;
  for(const k of KEYS)for(const w of[320,640,1024,1600])for(const f of['webp','avif']){
    const key='products/'+k+'/seed-1-'+w+'.'+f;
    const exists=await s3.send(new HeadObjectCommand({Bucket:'media',Key:key})).then(()=>true,()=>false);
    if(exists){kept++;continue;}
    await s3.send(new PutObjectCommand({Bucket:'media',Key:key,Body:f==='webp'?WEBP:AVIF,ContentType:'image/'+f})).catch(()=>{});
    n++;
  }
  console.log('Uploaded '+n+' placeholder image derivatives ('+kept+' existing kept)');
})().catch(e=>{console.error(e.message);process.exit(1)});
" && touch "$media_marker" && ok "Media images seeded"
}

# ─── application servers ─────────────────────────────────────────────────────
start_api() {
  if pid_alive "$API_PID"; then
    warn "API already running (PID $(cat "$API_PID"))"
    return 0
  fi
  if port_open "$API_PORT"; then
    warn "Port $API_PORT is in use (started externally?) — skipping API start"
    return 0
  fi
  info "Starting API server (port $API_PORT)..."
  nohup pnpm --filter @pe/api --prefix "$ROOT" dev \
    >> "$API_LOG" 2>&1 &
  echo $! > "$API_PID"
  wait_for_port "$API_PORT" "API" 60
}

start_web() {
  if pid_alive "$WEB_PID"; then
    warn "Web already running (PID $(cat "$WEB_PID"))"
    return 0
  fi
  if port_open "$WEB_PORT"; then
    warn "Port $WEB_PORT is in use (started externally?) — skipping web start"
    return 0
  fi
  info "Starting Next.js web (port $WEB_PORT)..."
  nohup pnpm --filter @pe/web --prefix "$ROOT" dev \
    >> "$WEB_LOG" 2>&1 &
  echo $! > "$WEB_PID"
  wait_for_port "$WEB_PORT" "Web" 120
}

# ─── commands ─────────────────────────────────────────────────────────────────
cmd_infra_start() {
  ensure_dirs
  heading "Starting infrastructure services..."
  start_postgres
  start_valkey
  start_minio
  start_mailpit
}

cmd_infra_stop() {
  heading "Stopping infrastructure services..."
  stop_mailpit
  stop_minio
  stop_valkey
  stop_postgres
}

cmd_start() {
  ensure_dirs
  ensure_env

  cmd_infra_start
  migrate_and_seed
  seed_media_images

  heading "Starting application servers..."
  start_api
  start_web

  echo
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD} Stack is running — open these in your browser:${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo
  echo -e "  ${GREEN}Storefront${RESET}   →  http://localhost:$WEB_PORT"
  echo -e "  ${GREEN}Admin${RESET}        →  http://localhost:$WEB_PORT/admin"
  echo -e "  ${GREEN}API${RESET}          →  http://localhost:$API_PORT  (health: /healthz, readyz: /readyz)"
  echo -e "  ${GREEN}Mailpit${RESET}      →  http://localhost:$MAILPIT_HTTP_PORT  (view emails)"
  echo -e "  ${GREEN}MinIO${RESET}        →  http://localhost:$MINIO_CONSOLE_PORT  ($MINIO_ROOT_USER / $MINIO_ROOT_PASSWORD)"
  echo
  echo "  Logs: ./scripts/dev.sh logs"
  echo "  Stop: ./scripts/dev.sh stop"
  echo
}

cmd_stop() {
  local mode="${1:-}"
  heading "Stopping application servers..."
  stop_pid "$API_PID" "API"
  stop_pid "$WEB_PID" "Web"

  # Release ports that might still be held
  for port in $API_PORT $WEB_PORT; do
    local pids; pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    [[ -n "$pids" ]] && kill $pids 2>/dev/null && ok "Freed port $port" || true
  done

  if [[ "$mode" == "all" ]]; then
    cmd_infra_stop
  fi
}

cmd_restart() {
  cmd_stop
  echo
  cmd_start
}

cmd_status() {
  heading "Stack status"
  echo

  local services=("Postgres:$PG_PORT" "Valkey:$VALKEY_PORT" "MinIO:$MINIO_PORT" "Mailpit:$MAILPIT_HTTP_PORT" "API:$API_PORT" "Web:$WEB_PORT")
  for entry in "${services[@]}"; do
    local svc="${entry%%:*}" port="${entry##*:}"
    if port_open "$port"; then
      ok "$svc  →  :$port"
    else
      err "$svc  stopped  (:$port)"
    fi
  done

  echo
  echo "  Storefront   →  http://localhost:$WEB_PORT"
  echo "  Admin        →  http://localhost:$WEB_PORT/admin"
  echo "  API health   →  http://localhost:$API_PORT/healthz"
  echo "  Mailpit      →  http://localhost:$MAILPIT_HTTP_PORT"
  echo "  MinIO        →  http://localhost:$MINIO_CONSOLE_PORT"

  echo
  if curl -fs "http://localhost:$API_PORT/healthz" &>/dev/null; then
    ok "API health check passed"
  else
    warn "API health not responding (may still be starting, or stopped)"
  fi
}

cmd_logs() {
  local target="${1:-both}"
  ensure_dirs
  case "$target" in
    api)
      [[ -f "$API_LOG" ]] || { warn "No API log yet"; exit 0; }
      tail -f "$API_LOG"
      ;;
    web)
      [[ -f "$WEB_LOG" ]] || { warn "No web log yet"; exit 0; }
      tail -f "$WEB_LOG"
      ;;
    both|*)
      for f in "$API_LOG" "$WEB_LOG"; do [[ -f "$f" ]] || touch "$f"; done
      tail -f "$API_LOG" -f "$WEB_LOG" \
        | awk '/==> .*api\.log/ {src="[api] "} /==> .*web\.log/ {src="[web] "} !/^==>/ {print src $0}'
      ;;
  esac
}

# ─── dispatch ─────────────────────────────────────────────────────────────────
case "${1:-help}" in
  start)   cmd_start ;;
  stop)    cmd_stop "${2:-}" ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs "${2:-both}" ;;
  infra)
    case "${2:-}" in
      start) ensure_dirs; cmd_infra_start ;;
      stop)  cmd_infra_stop ;;
      *) echo "Usage: $0 infra start|stop"; exit 1 ;;
    esac
    ;;
  help|--help|-h)
    echo
    echo -e "${BOLD}Puja Essentials dev stack${RESET}"
    echo
    echo "  ./scripts/dev.sh start            Start everything (infra + API + web)"
    echo "  ./scripts/dev.sh stop             Stop API & web (keep infra running)"
    echo "  ./scripts/dev.sh stop all         Stop everything including infra"
    echo "  ./scripts/dev.sh restart          stop + start"
    echo "  ./scripts/dev.sh status           Show what is running"
    echo "  ./scripts/dev.sh logs             Tail API + web logs interleaved"
    echo "  ./scripts/dev.sh logs api         Tail API log only"
    echo "  ./scripts/dev.sh logs web         Tail web log only"
    echo "  ./scripts/dev.sh infra start      Start Postgres/Valkey/MinIO/Mailpit only"
    echo "  ./scripts/dev.sh infra stop       Stop infra only"
    echo
    echo "  Data stored in: .dev-stack/"
    echo "  Logs:           .dev-stack/logs/"
    echo
    ;;
  *)
    err "Unknown command: ${1}"
    echo "Run ./scripts/dev.sh help for usage."
    exit 1
    ;;
esac
