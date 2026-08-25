#!/usr/bin/env bash
#
# Apply the Vercel WAF rate-limit rules from docs/RATE-LIMITING.md.
#
# Why a script rather than six trips through the dashboard form: each rule is a
# condition, a window, a limit, a key and a follow-up action, and getting one
# field wrong on a rule meant to protect money is easy and silent. `vercel
# firewall rules add` takes all of it non-interactively, so the rules live in
# version control next to the reasoning for them.
#
# They cannot go in vercel.json — its `mitigate` property supports only
# `challenge` and `deny`, not rate limits.
#
# Plan limits are strict, and are the reason the rules are ordered:
#   Hobby — 1 rate-limit rule, 3 custom rules per project
#   Pro   — 40
# So this applies them highest-value first and stops cleanly when the plan
# refuses the next one, rather than failing half-way with no summary.
#
# Safe to re-run: a rule whose name already exists is skipped, not duplicated.
#
#   bash scripts/apply-firewall.sh            # apply, show a diff, offer to publish
#   bash scripts/apply-firewall.sh --dry-run  # print the commands only
#
set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

say()  { printf '%s\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }

# ── Preflight ────────────────────────────────────────────────────────────────
# Skipped entirely under --dry-run: the whole point of a dry run is to read the
# commands before installing or logging in to anything.
EXISTING=""
if [ "$DRY_RUN" -eq 0 ]; then
  if ! command -v vercel >/dev/null 2>&1; then
    fail "The Vercel CLI is not installed."
    say  "  npm i -g vercel"
    exit 1
  fi
  if ! vercel whoami >/dev/null 2>&1; then
    fail "Not logged in to Vercel."
    say  "  vercel login"
    exit 1
  fi
  if [ ! -f .vercel/project.json ]; then
    fail "This directory is not linked to a Vercel project."
    say  "  vercel link"
    exit 1
  fi
  ok "Logged in as $(vercel whoami 2>/dev/null)"
  say ""
  # Names already on the project, so a re-run does not duplicate.
  EXISTING="$(vercel firewall rules list --json 2>/dev/null || echo '')"
fi

applied=(); skipped=(); refused=(); stop=0

# add_rule <name> <window-seconds> <requests> <over-limit-action> <condition-json>...
#
# Conditions combine with AND, which is what every rule here wants.
add_rule() {
  local name="$1" window="$2" requests="$3" action="$4"
  shift 4

  if [ "$stop" -eq 1 ]; then
    refused+=("$name")
    return
  fi

  if [ -n "$EXISTING" ] && printf '%s' "$EXISTING" | grep -qF "\"$name\""; then
    skipped+=("$name")
    say "  · $name — already present"
    return
  fi

  local args=()
  local c
  for c in "$@"; do
    args+=(--condition "$c")
  done
  args+=(--action rate_limit
         --rate-limit-window "$window"
         --rate-limit-requests "$requests"
         --rate-limit-keys ip
         --rate-limit-action "$action"
         --description "See docs/RATE-LIMITING.md"
         --yes)

  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'vercel firewall rules add %q' "$name"
    printf ' %q' "${args[@]}"
    printf '\n'
    applied+=("$name")
    return
  fi

  say "  → $name"
  local out
  if out=$(vercel firewall rules add "$name" "${args[@]}" 2>&1); then
    applied+=("$name")
    return
  fi

  # A plan limit is not a script failure — it is the expected outcome on Hobby.
  # Report it as such and stop, rather than trying the rest and printing five
  # more copies of the same error.
  if printf '%s' "$out" | grep -qiE "limit|plan|upgrade|maximum|exceed"; then
    warn "  ✗ $name — the plan will not take another rule."
  else
    fail "  ✗ $name failed:"
    printf '%s\n' "$out" | sed 's/^/      /'
  fi
  refused+=("$name")
  stop=1
}

# ── The rules, in priority order ─────────────────────────────────────────────
# Keep in step with the table in docs/RATE-LIMITING.md. Order matters: on Hobby
# only the first one lands, so the first one must be the one worth having alone.

# 1. Every write in the app is a POST, so this single rule covers withdrawal,
#    checkout, claim and submit at once — including routes not written yet.
add_rule "Catch-all API writes" 60 600 challenge \
  '{"type":"path","op":"pre","value":"/api/"}' \
  '{"type":"method","op":"eq","value":"POST"}'

# 2. Credential stuffing. The in-memory limiter on these routes is per-instance
#    and is documented as not being a real bound.
add_rule "Auth brute force" 60 60 challenge \
  '{"type":"path","op":"pre","value":"/api/auth"}'

# 3. The private-bucket proxy every image and video streams through — the one
#    endpoint that bills real S3 egress on somebody else's traffic.
add_rule "Media proxy egress" 60 600 challenge \
  '{"type":"path","op":"pre","value":"/api/media"}'

# 4. S3 writes, up to 5 MB each. Deny rather than challenge: nothing legitimate
#    uploads sixty files a minute.
add_rule "Upload flood" 60 60 deny \
  '{"type":"path","op":"pre","value":"/api/upload"}'

# 5. Hit on every page view. A flood loads the database AND corrupts advertiser
#    impression figures.
add_rule "Ad serve flood" 60 300 challenge \
  '{"type":"path","op":"pre","value":"/api/ads/serve"}'

# 6. Four parallel `contains` scans per call.
add_rule "Search flood" 60 120 challenge \
  '{"type":"path","op":"pre","value":"/api/search"}'

# ── Summary, then diff and publish ───────────────────────────────────────────
say ""
bold "Summary"
[ ${#applied[@]} -gt 0 ] && ok   "  staged:      ${applied[*]}"
[ ${#skipped[@]} -gt 0 ] && say  "  skipped:     ${skipped[*]} (already present)"
[ ${#refused[@]} -gt 0 ] && warn "  not applied: ${refused[*]}"

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "Dry run — nothing was sent to Vercel."
  exit 0
fi

if [ ${#refused[@]} -gt 0 ]; then
  say ""
  warn "On Hobby only one rate-limit rule is allowed (three custom rules in"
  warn "total). Rule 1 is the catch-all and covers every write in the app, so it"
  warn "is the right one to have alone. Pro raises the limit to forty."
fi

if [ ${#applied[@]} -eq 0 ]; then
  say ""
  say "Nothing new to publish."
  exit 0
fi

say ""
bold "Staged changes"
vercel firewall diff || true

say ""
read -r -p "Publish these to production? [y/N] " reply
case "$reply" in
  [yY]*)
    vercel firewall publish --yes && ok "Published."
    ;;
  *)
    say "Left staged. Publish later with: vercel firewall publish --yes"
    say "Or discard with:                 vercel firewall discard --yes"
    ;;
esac
