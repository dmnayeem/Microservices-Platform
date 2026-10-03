#!/usr/bin/env bash
# Keep the VPS clean. Runs daily (systemd timer) and after every deploy.
# Safe at any time: it never touches the build being served or the one being
# built, and never removes the images or volumes that running containers use.
set -uo pipefail
cd /opt/revtype 2>/dev/null || exit 0
log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
before=$(df --output=avail -BM / | tail -1 | tr -d ' M')

# --- build directories --------------------------------------------------------
set -a; source ./.deploy-state 2>/dev/null || true; set +a
CUR="${CURRENT_DIST:-}"; PREV="${PREVIOUS_DIST:-}"
if pgrep -f 'bash ./deploy.sh' >/dev/null 2>&1; then
  log "deploy in progress - leaving build dirs alone"
else
  for d in .next-*/; do
    d="${d%/}"; [[ -d "$d" ]] || continue
    [[ "$d" == "$CUR" || "$d" == "$PREV" ]] && continue
    rm -rf "$d" && log "removed stale build $d"
  done
  # The previous build only exists for rollback; its compile cache is dead weight.
  [[ -n "$PREV" && -d "$PREV/cache/turbopack" ]] && rm -rf "$PREV/cache/turbopack" && log "trimmed compile cache from $PREV"
fi
rm -f build.log .deploy-state.v1 deploy.v1.sh docker-compose.v1.yml 2>/dev/null

# --- npm download cache: useful up to a point ---------------------------------
if [[ -d .npm-cache ]] && (( $(du -sm .npm-cache | cut -f1) > 2048 )); then
  rm -rf .npm-cache && log "npm cache exceeded 2 GB - reset"
fi

# --- docker --------------------------------------------------------------------
# Legacy image-based releases (pre bind-mount era); harmless if none exist.
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^revtype-app:' | xargs -r docker image rm -f >/dev/null 2>&1 && log "removed legacy revtype-app images"
docker container prune -f >/dev/null 2>&1         # exited one-off builder containers
docker image prune -f >/dev/null 2>&1             # dangling layers only; in-use images are never touched
docker builder prune -af >/dev/null 2>&1          # no images are built any more; anything here is stale
docker network prune -f >/dev/null 2>&1

# --- system (root only) ---------------------------------------------------------
if [[ $EUID -eq 0 ]]; then
  apt-get clean >/dev/null 2>&1
  apt-get autoremove -y >/dev/null 2>&1
  journalctl --vacuum-size=200M >/dev/null 2>&1
  find /root -maxdepth 1 -name '*.log' -mtime +7 -delete 2>/dev/null
  find /root -maxdepth 1 -name 'install-v2.sh' -delete 2>/dev/null
fi

after=$(df --output=avail -BM / | tail -1 | tr -d ' M')
log "disk free: $((after/1024)) GB (freed $(( (after-before) > 0 ? (after-before) : 0 )) MB)   serving $CUR   rollback ${PREV:-none}"
