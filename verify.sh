#!/usr/bin/env bash
# Verify the deployment. ./verify.sh   ??? exit 1 if anything FAILs.
set -uo pipefail
cd "$(dirname "$0")"; set -a; source ./.env 2>/dev/null || true; set +a
D="${APP_DOMAIN:-revtype.com}"; pass=0; fail=0; warn=0
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
hm(){ printf '  \033[33mWARN\033[0m  %s\n' "$1"; warn=$((warn+1)); }
hdr(){ printf '\n\033[1m%s\033[0m\n' "$1"; }
code(){ curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null || echo 000; }

hdr "1. Containers"
for svc in app caddy; do
  cid=$(docker compose ps -q "$svc" 2>/dev/null); [[ -z "$cid" ]] && { no "$svc not running"; continue; }
  st=$(docker inspect -f '{{.State.Status}}' "$cid"); h=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid")
  [[ "$st" == running && ( "$h" == healthy || "$h" == none ) ]] && ok "$svc running (health: $h)" || no "$svc state=$st health=$h"
done
u=$(docker compose exec -T app id -u 2>/dev/null || echo ?); [[ "$u" == 1001 ]] && ok "app runs as non-root (uid $u)" || no "app uid=$u, expected 1001"

hdr "2. Env file"
if [[ -f .env ]]; then
  p=$(stat -c %a .env); [[ "$p" == 600 ]] && ok ".env is 0600" || no ".env is $p"
  git check-ignore -q .env && ok ".env git-ignored" || hm ".env NOT git-ignored"
  for k in DATABASE_URL NEXTAUTH_SECRET AUTH_TRUST_HOST; do grep -qE "^$k=.+" .env && ok "$k set" || no "$k empty"; done
  grep -qE '^DATABASE_URL="?prisma\+postgres://' .env && ok "DATABASE_URL ??? Prisma Postgres (external)" || no "DATABASE_URL is not the Accelerate URL"
  grep -qE '^NEXTAUTH_URL="?https://' .env && ok "NEXTAUTH_URL is https" || no "NEXTAUTH_URL not https"
else no ".env missing"; fi
img=$(docker compose ps --format '{{.Image}}' app 2>/dev/null | head -1)
docker run --rm --entrypoint sh "$img" -c 'test -f /app/.env' 2>/dev/null && no ".env is INSIDE the image" || ok ".env not baked into image"

hdr "3. Nothing stateful on this host"
ss -ltnH | awk '{print $4}' | grep -qE ':(5432|3306|6379|27017)$' && no "a database port is listening" || ok "no database port listening"
docker ps --format '{{.Image}}' | grep -qiE 'postgres|mysql|redis|mongo' && no "a database container is running" || ok "no database container"
docker compose ps --format '{{.Ports}}' app | grep -q '0.0.0.0' && no "app port published to internet" || ok "app port not published (Caddy-only)"

hdr "4. Host"
ufw status | grep -q 'Status: active' && ok "ufw active" || no "ufw inactive"
for p in 22 80 443; do ufw status | grep -qE "^$p/tcp +ALLOW" && ok "ufw allows $p" || no "ufw: no rule for $p"; done
ufw status | grep -qE '^(5432|3000)' && no "ufw exposes 5432/3000" || ok "ufw exposes nothing else"
systemctl is-active -q fail2ban && ok "fail2ban running" || hm "fail2ban not running"
swapon --show | grep -q . && ok "swap active" || hm "no swap"
sshd -T 2>/dev/null | grep -qi '^permitrootlogin no' && ok "root SSH login disabled" || hm "PermitRootLogin still allows root"
sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' && ok "SSH password auth disabled" || hm "SSH password auth still enabled"

hdr "5. HTTP ??? HTTPS"
rc=$(code -I "http://$D/"); loc=$(curl -sSI --max-time 15 "http://$D/" 2>/dev/null | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
[[ "$rc" =~ ^30[1278]$ && "$loc" == https://* ]] && ok "http://$D ??? $loc ($rc)" || no "no redirect (got $rc, location='$loc')"

hdr "6. TLS"
if cert=$(echo | timeout 15 openssl s_client -servername "$D" -connect "$D:443" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null); then
  ok "TLS handshake OK"; echo "$cert" | sed 's/^/        /'
  end=$(echo "$cert" | grep notAfter | cut -d= -f2); left=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  [[ $left -gt 20 ]] && ok "cert valid $left more days" || hm "cert expires in $left days"
  echo | timeout 10 openssl s_client -servername "$D" -connect "$D:443" -tls1_1 2>/dev/null | grep -q 'Protocol *: *TLSv1.1' && hm "TLS 1.1 accepted" || ok "TLS 1.1 refused"
else no "TLS handshake failed"; fi

hdr "7. Exposed files / directory browsing"
for p in /.env /.git/config /.git/HEAD /Dockerfile /docker-compose.yml /package.json /next.config.ts /prisma/schema.prisma /src/lib/prisma.ts /deploy.sh /.aws/credentials; do
  rc=$(code "https://$D$p"); [[ "$rc" =~ ^40[34]$ ]] && ok "$p ??? $rc" || no "$p ??? $rc"
done
curl -sS --max-time 15 "https://$D/ads/" 2>/dev/null | head -c 3000 | grep -qiE '<title>Index of|Directory listing' && no "/ads/ lists directory" || ok "/ads/ does not list"

hdr "8. Security headers"
hd=$(curl -sSI --max-time 15 "https://$D/" 2>/dev/null | tr -d '\r')
for h in x-content-type-options referrer-policy strict-transport-security x-frame-options; do echo "$hd" | grep -qi "^$h:" && ok "$h" || no "$h missing"; done
echo "$hd" | grep -qi '^content-security-policy' && ok "CSP present" || hm "no CSP"
echo "$hd" | grep -qi '^server:' && hm "Server header present: $(echo "$hd" | grep -i '^server:' | cut -d' ' -f2-)" || ok "Server header suppressed"
echo "$hd" | grep -qi '^x-powered-by' && hm "x-powered-by present" || ok "x-powered-by absent"

hdr "9. Application"
rc=$(code "https://$D/api/health"); [[ "$rc" == 200 ]] && ok "/api/health ??? 200" || no "/api/health ??? $rc"
curl -sS --max-time 15 "https://$D/api/health" 2>/dev/null | head -c 400 | sed 's/^/        /'; echo
rc=$(code "https://$D/"); [[ "$rc" == 200 ]] && ok "homepage ??? 200" || no "homepage ??? $rc"
rc=$(code "https://$D/api/auth/providers"); [[ "$rc" == 200 ]] && ok "/api/auth/providers ??? 200 (next-auth up)" || hm "/api/auth/providers ??? $rc"

printf '\n\033[1mResult: %d passed, %d failed, %d warnings\033[0m\n' $pass $fail $warn
[[ $fail -eq 0 ]]
