#!/usr/bin/env bash
#   ./deploy.sh --image ghcr.io/owner/repo:<sha>   CI path: pull a built image
#   ./deploy.sh                                     manual: build here, deploy
#   ./deploy.sh --rollback                          previous image
# An unhealthy start reverts to the previous image automatically.
set -euo pipefail
cd "$(dirname "$0")"
IMAGE=""; MODE="build"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)    IMAGE="$2"; MODE="pull"; shift 2 ;;
    --rollback) MODE="rollback"; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done
log()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
[[ -f .env ]] || fail ".env not found in $(pwd)"
set -a; source ./.env; set +a
: "${APP_DOMAIN:?APP_DOMAIN missing from .env}"
: "${DATABASE_URL:?DATABASE_URL missing from .env}"

STATE=.deploy-state; touch "$STATE"; set -a; source "$STATE"; set +a
CURRENT="${CURRENT_IMAGE:-}"; PREVIOUS="${PREVIOUS_IMAGE:-}"
[[ -f .ghcr-token ]] && docker login ghcr.io -u "${GHCR_USER:-sabbir073}" --password-stdin < .ghcr-token >/dev/null

case "$MODE" in
  rollback) [[ -n "$PREVIOUS" ]] || fail "no previous image recorded"; TARGET="$PREVIOUS"; log "Rolling back to $TARGET" ;;
  pull)     log "Pulling $IMAGE"; docker pull "$IMAGE" || fail "pull failed ??? old container still serving"; TARGET="$IMAGE" ;;
  build)    log "Building locally"; docker compose build app || fail "build failed ??? old container still serving"; TARGET="revtype-app:latest" ;;
esac
export APP_IMAGE="$TARGET" APP_PULL_POLICY=never

# Migrations are NOT run here. The schema lives in Prisma Postgres and is
# managed from your machine (`npx prisma migrate deploy`), exactly as it was
# on Vercel ??? vercel.json never ran a migrate step either.

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
  if [[ -n "$PREVIOUS" && "$MODE" != rollback ]]; then
    log "Unhealthy ??? reverting to $PREVIOUS"
    APP_IMAGE="$PREVIOUS" docker compose up -d
    fail "deploy reverted to $PREVIOUS"
  fi
  fail "unhealthy and nothing to revert to"
fi

if   [[ "$MODE" == rollback ]];                              then printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$CURRENT"  > "$STATE"
elif [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" ]];         then printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$CURRENT"  > "$STATE"
else                                                               printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\n' "$TARGET" "$PREVIOUS" > "$STATE"
fi

rc=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://${APP_DOMAIN}/api/health" || echo 000)
[[ "$rc" == 200 ]] && log "https://${APP_DOMAIN}/api/health ??? 200" || printf '\033[33m  WARN\033[0m external check ??? %s (DNS/Cloudflare not pointed here yet?)\n' "$rc"
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
log "Deployed: $TARGET"
