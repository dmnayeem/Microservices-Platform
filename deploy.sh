#!/usr/bin/env bash
# Vercel-style deploy on this VPS. No image is built.
#
#   ./deploy.sh              build the current checkout, switch the app to it
#   ./deploy.sh --rollback   switch back to the previous build (no build)
#
# How it works:
#   node_modules/      persistent; `npm ci` runs only when package-lock changes
#   .next-<sha>/       one build output per commit; the app serves one of them
#   .next-<sha>/cache  Turbopack's incremental cache, carried forward each build
#   .deploy-state      CURRENT_DIST / PREVIOUS_DIST, the rollback pointer
#
# The live build is never touched: the new one goes to its own directory and
# the app container is re-pointed only after it builds. Unhealthy start ->
# automatic switch back. A failed build changes nothing at all.
set -euo pipefail
cd "$(dirname "$0")"
MODE=build; [[ "${1:-}" == --rollback ]] && MODE=rollback

log()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
secs() { echo $(( $(date +%s) - $1 )); }

[[ -f .env ]] || fail ".env not found in $(pwd)"
set -a; source ./.env; set +a
: "${APP_DOMAIN:?APP_DOMAIN missing from .env}"
: "${DATABASE_URL:?DATABASE_URL missing from .env}"

STATE=.deploy-state; touch "$STATE"; set -a; source "$STATE"; set +a
CURRENT="${CURRENT_DIST:-}"; PREVIOUS="${PREVIOUS_DIST:-}"
T0=$(date +%s)

# Point NEXT_DIST_DIR in .env at a build dir (compose reads .env, so a plain
# `docker compose up -d` later always serves the right one).
set_dist() {
  if grep -qE '^NEXT_DIST_DIR=' .env; then
    sed -i -E "s|^NEXT_DIST_DIR=.*|NEXT_DIST_DIR=\"$1\"|" .env
  else
    printf '\nNEXT_DIST_DIR="%s"\n' "$1" >> .env
  fi
  # The shell too. `source ./.env` above exported the OLD value, and compose
  # interpolates ${NEXT_DIST_DIR} from the shell before the .env file — so
  # every deploy restarted the app on the PREVIOUS build (2026-10-04: PR #79
  # "deployed" green while #78's code kept serving).
  export NEXT_DIST_DIR="$1"
}

if [[ $MODE == rollback ]]; then
  [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]] || fail "no previous build to roll back to (state: current=$CURRENT previous=$PREVIOUS)"
  TARGET="$PREVIOUS"
  log "Rolling back to $TARGET"
else
  free_gb=$(( $(df --output=avail -BM / | tail -1 | tr -d ' M') / 1024 ))
  (( free_gb >= 5 )) || fail "only ${free_gb} GB free on / - refusing to build into a full disk (run ./housekeeping.sh)"
  SHA=$(git rev-parse --short=12 HEAD)
  TARGET=".next-$SHA"
  log "Deploying $SHA  ($(git log -1 --format=%s | cut -c1-70))"

  # ---- 1. dependencies: only when the lockfile changed ---------------------
  LOCK_HASH=$(sha256sum package-lock.json | cut -c1-16)
  if [[ ! -d node_modules/next || "$(cat .lock-hash 2>/dev/null)" != "$LOCK_HASH" ]]; then
    log "package-lock.json changed (or first run) - npm ci"
    t=$(date +%s)
    docker compose run --rm --no-deps -T builder sh -c \
      'npm ci --include=dev --prefer-offline --no-audit --no-fund && npm install --no-save --include=dev --prefer-offline --no-audit --no-fund sharp' \
      || fail "npm ci failed after $(secs $t)s - $CURRENT still serving, nothing changed"
    echo "$LOCK_HASH" > .lock-hash
    log "Dependencies installed in $(secs $t)s"
  else
    log "Dependencies unchanged - skipping npm ci"
  fi

  # ---- 2. build cache -------------------------------------------------------
  # Turbopack's persistent cache (~900 MB on disk) needs ~5.7 GB of RAM to use,
  # which this 8 GB box cannot give it alongside the live app: a "warm" build
  # thrashes swap and ends up SLOWER than cold. So builds start cold here.
  # With 16 GB of RAM, set CARRY_CACHE=1 below and warm builds drop to 1-3 min.
  CARRY_CACHE=${CARRY_CACHE:-0}
  rm -rf "$TARGET"; mkdir -p "$TARGET"
  if [[ "$CARRY_CACHE" == 1 && -n "$CURRENT" && -d "$CURRENT/cache" ]]; then
    cp -a "$CURRENT/cache" "$TARGET/cache"
    log "Build cache carried from $CURRENT ($(du -sh "$TARGET/cache" | cut -f1))"
  else
    log "Cold build (cache carry-forward off: CARRY_CACHE=$CARRY_CACHE)"
  fi

  # ---- 3. build into the new dir; the live one is untouched -----------------
  t=$(date +%s)
  BUILD_DIST_DIR="$TARGET" docker compose run --rm --no-deps -T builder npm run build \
    || { rm -rf "$TARGET"; fail "build failed after $(secs $t)s - $CURRENT still serving, nothing changed"; }
  # Compile cache is only worth keeping if the next build will read it.
  [[ "$CARRY_CACHE" == 1 ]] || rm -rf "$TARGET/cache/turbopack"
  log "Built in $(secs $t)s  ($(du -sh "$TARGET" | cut -f1))"
fi

# ---- 4. switch ------------------------------------------------------------
log "Switching app -> $TARGET"
set_dist "$TARGET"
docker compose up -d --no-deps --force-recreate app >/dev/null 2>&1

healthy=0
for i in $(seq 1 36); do
  cid=$(docker compose ps -q app)
  st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo starting)
  [[ "$st" == healthy ]] && { healthy=1; log "Healthy after $((i*5))s"; break; }
  [[ "$st" == unhealthy ]] && break
  sleep 5
done
if [[ $healthy -ne 1 ]]; then
  docker compose logs --tail=80 app
  if [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" && $MODE != rollback ]]; then
    log "Unhealthy - switching back to $CURRENT"
    set_dist "$CURRENT"
    docker compose up -d --no-deps --force-recreate app >/dev/null 2>&1
    fail "deploy reverted to $CURRENT"
  fi
  fail "unhealthy and nothing to revert to"
fi

# ---- 4b. Caddy: apply a changed Caddyfile ----------------------------------
# The Caddyfile is bind-mounted as a single FILE. `git reset --hard` replaces
# that file, and a running container keeps reading the old one — so a changed
# Caddyfile used to need a manual restart on the VPS. Now: only when it
# changed, validate it in a throwaway container (which sees the new file), and
# recreate Caddy only if it is valid. An invalid one leaves the running Caddy
# untouched and says so; the site never goes down over a typo.
CADDY_HASH=$(sha256sum Caddyfile | cut -c1-16)
if [[ "$(cat .caddy-hash 2>/dev/null)" != "$CADDY_HASH" ]]; then
  if docker compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    docker compose up -d --no-deps --force-recreate caddy >/dev/null 2>&1 \
      && echo "$CADDY_HASH" > .caddy-hash \
      && log "Caddyfile changed - Caddy reloaded" \
      || printf '\033[33m  WARN\033[0m Caddy could not be recreated - previous Caddy still running\n'
  else
    printf '\033[33m  WARN\033[0m Caddyfile is INVALID - not applied, previous Caddy still running. Check: docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile\n'
  fi
fi

# ---- 5. record state, prune old builds ------------------------------------
if   [[ $MODE == rollback ]];                      then printf 'CURRENT_DIST=%s\nPREVIOUS_DIST=%s\n' "$TARGET" "$CURRENT"  > "$STATE"
elif [[ -n "$CURRENT" && "$CURRENT" != "$TARGET" ]]; then printf 'CURRENT_DIST=%s\nPREVIOUS_DIST=%s\n' "$TARGET" "$CURRENT"  > "$STATE"
else                                                    printf 'CURRENT_DIST=%s\nPREVIOUS_DIST=%s\n' "$TARGET" "$PREVIOUS" > "$STATE"
fi
set -a; source "$STATE"; set +a
# ---- 6. make the new build visible IMMEDIATELY (what Vercel does on deploy)
# (a) Service worker: stamp the build id into the copy Caddy serves. New bytes
#     = new SW; its activate() deletes the previous build's caches.
BUILD_ID=$(cat "$TARGET/BUILD_ID" 2>/dev/null || echo "${TARGET#.next-}")
mkdir -p sw
sed "s/__BUILD_ID__/$BUILD_ID/g" public/sw.js > sw/sw.js.tmp && mv -f sw/sw.js.tmp sw/sw.js
log "Service worker stamped with build $BUILD_ID"
# (b) Caddy: graceful reload picks up Caddyfile changes with zero dropped
#     connections. (--no-recreate: a change to caddy's compose definition is
#     rare and is applied by hand with `docker compose up -d caddy`.)
docker compose up -d --no-deps --no-recreate caddy >/dev/null 2>&1 || true
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 && log "Caddy config reloaded"
# (c) Cloudflare: purge the edge, exactly like Vercel purges its CDN.
#     Needs CF_ZONE_ID + CF_API_TOKEN (token permission: Zone > Cache Purge) in .env.
if [[ -n "${CF_ZONE_ID:-}" && -n "${CF_API_TOKEN:-}" ]]; then
  r=$(curl -sS --max-time 20 -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' 2>&1 || true)
  if echo "$r" | grep -q '"success":true'; then log "Cloudflare edge cache purged"
  else printf '\033[33m  WARN\033[0m Cloudflare purge failed: %s\n' "$(echo "$r" | tr -d '\n' | cut -c1-200)"; fi
else
  log "Cloudflare purge skipped - add CF_ZONE_ID and CF_API_TOKEN to .env to enable"
fi

# Everything else that accumulates (old build dirs, docker leftovers) is one job.
[[ -x ./housekeeping.sh ]] && FROM_DEPLOY=1 bash ./housekeeping.sh | sed 's/^/  /' || true

rc=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://${APP_DOMAIN}/api/health" || echo 000)
[[ "$rc" == 200 ]] && log "https://${APP_DOMAIN}/api/health -> 200" || printf '\033[33m  WARN\033[0m external check -> %s\n' "$rc"
log "Done in $(secs $T0)s.  Serving $CURRENT_DIST   (rollback: ${PREVIOUS_DIST:-none})"
