#!/usr/bin/env bash
# Build on this VPS and deploy. Run from /opt/revtype (CI does this over SSH).
#
#   ./deploy.sh              build the current checkout, deploy, health-gate
#   ./deploy.sh --rollback   switch back to the previous image (no build)
#
# Every build is tagged with its git SHA. The previous image is kept, so an
# unhealthy start reverts automatically and a bad release is one command back.
set -euo pipefail
cd "$(dirname "$0")"
MODE=build; [[ "${1:-}" == --rollback ]] && MODE=rollback

log()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
[[ -f .env ]] || fail ".env not found in $(pwd)"
set -a; source ./.env; set +a
: "${APP_DOMAIN:?APP_DOMAIN missing from .env}"
: "${DATABASE_URL:?DATABASE_URL missing from .env}"

STATE=.deploy-state; touch "$STATE"; set -a; source "$STATE"; set +a
CURRENT="${CURRENT_IMAGE:-}"; PREVIOUS="${PREVIOUS_IMAGE:-}"

if [[ $MODE == rollback ]]; then
  [[ -n "$PREVIOUS" ]] || fail "no previous image recorded in $STATE"
  docker image inspect "$PREVIOUS" >/dev/null 2>&1 || fail "previous image $PREVIOUS no longer on disk"
  TARGET="$PREVIOUS"; log "Rolling back to $TARGET"
else
  SHA=$(git rev-parse --short=12 HEAD)
  TARGET="revtype-app:$SHA"
  log "Building $TARGET  ($(git log -1 --format='%s' | cut -c1-70))"
  t0=$(date +%s)
  # Build BEFORE touching the running container: a failed build changes nothing.
  APP_IMAGE="$TARGET" docker compose build app \
    || fail "build failed after $(( $(date +%s) - t0 ))s â€” old container still serving, nothing changed"
  docker tag "$TARGET" revtype-app:latest
  log "Built in $(( $(date +%s) - t0 ))s"
fi
export APP_IMAGE="$TARGET" APP_PULL_POLICY=never

# Migrations are NOT run here. The schema lives in Prisma Postgres and is
# managed from your machine with `npx prisma migrate deploy`, exactly as it was
# on Vercel. Apply the migration first, then push the code.

log "Starting $TARGET"
docker compose up -d --remove-orphans

log "Waiting for health"
healthy=0
for i in $(seq 1 48); do
  cid=$(docker compose ps -q app)
  st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo starting)
  [[ "$st" == healthy ]] && { healthy=1; log "Healthy after $((i*5))s"; break; }
  [[ "$st" == unhealthy ]] && break
  sleep 5
done
if [[ $healthy -ne 1 ]]; then
  docker compose logs --tail=120 app
  if [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" && $MODE != rollback ]]; then
    log "Unhealthy â€” reverting to $CURRENT"
    APP_IMAGE="$CURRENT" docker compose up -d
    fail "deploy reverted to $CURRENT"
  fi
  fail "unhealthy and nothing to revert to"
fi

# Record state: what runs now, and what to go back to.
if [[ $MODE == rollback ]]; then
  printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$CURRENT" > "$STATE"
elif [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" ]]; then
  printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$CURRENT" > "$STATE"
else
  printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$PREVIOUS" > "$STATE"
fi
set -a; source "$STATE"; set +a

# Keep only the two images that matter (current + previous); drop the rest.
for img in $(docker image ls --format '{{.Repository}}:{{.Tag}}' revtype-app | grep -v ':latest$'); do
  [[ "$img" == "$CURRENT_IMAGE" || "$img" == "${PREVIOUS_IMAGE:-}" ]] && continue
  docker image rm -f "$img" >/dev/null 2>&1 && echo "  removed $img"
done
docker image prune -f >/dev/null 2>&1 || true

rc=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://${APP_DOMAIN}/api/health" || echo 000)
[[ "$rc" == 200 ]] && log "https://${APP_DOMAIN}/api/health â†’ 200" || printf '\033[33m  WARN\033[0m external check â†’ %s\n' "$rc"
log "Deployed: $CURRENT_IMAGE   (rollback target: ${PREVIOUS_IMAGE:-none})"
