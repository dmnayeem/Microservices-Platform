# Security runbook

## সংক্ষেপে (বাংলা)

- **Abuse ইমেইল এলে (২৪ ঘণ্টার মধ্যে):** `/admin/abuse`-এ গিয়ে অভিযোগের লিংক/IP দিয়ে কেস খুঁজুন, ক্ষতিকর কনটেন্ট বা অ্যাকাউন্ট বন্ধ করুন, প্রমাণ (স্ক্রিনশট/লগ) সংরক্ষণ করুন, তারপর নিচের টেমপ্লেট দিয়ে হোস্টকে লিখিত উত্তর দিন। উত্তর না দিলে হোস্ট সার্ভার বন্ধ করে দিতে পারে।
- **Cloudflare:** প্রক্সি (কমলা মেঘ) চালু, SSL "Full (strict)", WAF managed rules, Bot Fight Mode, `/api/auth` ও `/api/*/submit`-এ rate limit, আর সার্ভারের আসল IP কোথাও প্রকাশ করবেন না।
- **VPS:** শুধু SSH key দিয়ে লগইন, root লগইন বন্ধ, fail2ban, ufw (শুধু 22/80/443), স্বয়ংক্রিয় security update, অ্যাপ non-root ইউজারে চালান, প্রতিদিন ব্যাকআপ।
- **Secret ফাঁস হলে:** নিচের তালিকা ধরে সব key বদলান — সবার আগে `NEXTAUTH_SECRET`, ডাটাবেস ও S3 key।
- **নতুন header:** সাইট এখন nosniff, clickjacking guard, HSTS পাঠায়। CSP শুধু "report-only" — কিছু ব্লক করে না, শুধু লগে জানায়। সব কিছু env flag দিয়ে বন্ধ করা যায়।

---

## 1. Responding to a host / provider abuse email (within 24 hours)

Hosts (Vercel, the VPS provider, Cloudflare, AWS for S3, Google for AdSense)
send abuse reports for phishing links, malware, spam, copyright (DMCA) or
attack traffic. Most of them **suspend first and ask later if you do not reply
within 24–48 hours**. The goal is: acknowledge fast, act, reply with evidence.

**Step by step**

1. **Read what they are pointing at.** Note the exact URL(s), IP, timestamps
   (convert to your timezone) and the report ID. Do not click a reported link
   in your normal browser session — open it logged out or in a private window.
2. **Open the Abuse Center at `/admin/abuse`.** Search for the URL, post/task
   ID, user or IP from the report. It shows the case, the related user and
   their other content.
3. **Contain.** Depending on what it is:
   - user post / link / listing / ad → hide or remove it;
   - account that did it → suspend (not delete — you need the evidence);
   - uploaded file in S3 → remove it from the public path (the media proxy
     stops serving it);
   - attack traffic from our server (rare) → check for a compromised key or
     a runaway job; rotate secrets (section 4).
4. **Preserve evidence.** Keep the audit log entry, a screenshot, the user id
   and the request logs for the time window. Do not wipe the user.
5. **Reply to the provider** from the account email. Template:

   > Hello, thank you for the report (ref: XXXX). The reported content
   > (URL) was user-generated on our platform. We removed it on
   > DATE/TIME UTC and suspended the responsible account. We have also
   > reviewed the account's other content. Our abuse contact is
   > abuse@<your domain>; we respond within 24 hours. Regards, …

6. **Look for the pattern.** If the same kind of content keeps appearing,
   tighten the rule that let it through (link safety, upload checks, task
   review) — not just the single item.
7. **Copyright (DMCA) notices** follow the same flow; remove first, keep the
   notice. If the uploader disputes, a counter-notice restores it only after
   the legal waiting period.

Keep a short note of every case (date, provider, what, action, reply sent).
The Abuse Center case history is the right place.

## 2. Cloudflare checklist (if the domain is behind Cloudflare)

- [ ] DNS records for the site are **Proxied** (orange cloud). A grey-cloud
      record leaks the origin IP.
- [ ] SSL/TLS mode **Full (strict)**, with a valid certificate on the origin
      (Cloudflare Origin CA certificate is fine). Never "Flexible".
- [ ] "Always Use HTTPS" on; minimum TLS 1.2.
- [ ] **WAF → Managed rules** on (Cloudflare Managed Ruleset; OWASP set at
      a low sensitivity first — watch for false positives on task submissions).
- [ ] **Bot Fight Mode** on. If it blocks offerwall/CPA postbacks or payment
      gateway callbacks, add a skip rule for `/api/offerwall/*/callback`,
      `/api/cpa/postback`, `/api/deposits/gateway/callback`, `/api/cron/*`.
- [ ] **Rate limiting rules** (per IP, generous — an abuse ceiling):
  - `/api/auth/*` — e.g. 30 requests / minute → block 10 min;
  - `/api/*/submit` (task submissions) — e.g. 60 / minute → managed challenge;
  - never rate-limit the postback / callback paths above.
  - The app also limits by **account/email** in code, which is what matters
    when attackers rotate IPs — do not rely on IP allowlists.
- [ ] **Hide the origin IP:** on the VPS, allow ports 80/443 only from
      Cloudflare's IP ranges (ufw), and do not send mail directly from the
      web server's IP (use the mail provider). If the IP ever leaked, change it.
- [ ] Do not enable Cloudflare "Rocket Loader" or "Email obfuscation" — they
      rewrite scripts and can break the ad and embed scripts.

## 3. VPS hardening checklist

- [ ] SSH: key-only login (`PasswordAuthentication no`), `PermitRootLogin no`.
- [ ] `fail2ban` installed with the sshd jail enabled.
- [ ] `ufw`: default deny incoming; allow 22 (ideally only from your own
      machine — but your IP changes, so key-only SSH + fail2ban is the real
      guard), 80 and 443 (only from Cloudflare ranges if proxied).
- [ ] `unattended-upgrades` enabled for security updates; reboot monthly.
- [ ] The app runs as a **non-root user** (e.g. `revtype`), under a process
      manager (systemd or pm2) that restarts it.
- [ ] `.env` is readable only by that user (`chmod 600`), never in git.
- [ ] Reverse proxy (nginx/caddy) passes `X-Forwarded-For` / `X-Real-IP` so
      per-IP limits see the real client (see docs/RATE-LIMITING.md).
- [ ] Backups: database (the Prisma Postgres/Accelerate provider's backups +
      your own periodic dump), S3 bucket versioning on, and a copy of `.env`
      in a password manager. Test a restore once.
- [ ] Disk space and uptime alert (`/api/health` in an uptime checker).

## 4. Secrets to rotate (after a leak, a staff member leaving, or yearly)

Rotate in this order; redeploy after each group.

| Secret | Effect of rotating |
|---|---|
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Everyone is signed out once. Do this first after any suspected leak. |
| `DATABASE_URL` (Accelerate API key) | Regenerate in the Prisma console; keep the `prisma+postgres://` form. |
| AWS S3 access key / secret | Create new key, deploy, then delete the old one. |
| `GOOGLE_CLIENT_SECRET` | Google Cloud console → OAuth client → reset secret. |
| `CRON_SECRET` | Update the scheduler/cron caller at the same time. |
| Payment gateway keys (SSLCommerz etc.) | Gateway dashboard. |
| Offerwall / CPA postback secrets | Update in each network's dashboard at the same time, or postbacks fail. |
| SMTP password / app password | Mail provider. |
| AI keys (Gemini, Magnific, OpenAI) | Provider consoles. |
| Telegram / Discord bot tokens, Firebase keys | Provider consoles. |
| `SENTRY_AUTH_TOKEN` | Sentry settings. |
| Vercel / VPS / Cloudflare / registrar account passwords + 2FA | Account settings. |

## 5. Logs: what to keep and for how long

| Log | Keep | Why |
|---|---|---|
| Admin audit log (AuditLog) | 2 years minimum | Who changed what, money actions, bans. |
| Money ledger (transactions, withdrawals, deposits) | Permanently | Accounting / tax. |
| Auth events (sign-ins, failures, 2FA changes, password resets) | 1 year | Account-takeover investigations. |
| Abuse cases + evidence | 2 years after closing | Provider/legal follow-up. |
| Web server / request logs (IP, path, status, user id) | 90 days | Abuse reports usually arrive within weeks. |
| CSP violation reports (server log only) | 30 days | Only needed to tune the policy. |

Never log passwords, full card/bank numbers, session cookies, reset tokens or
API keys. IP addresses are personal data — keep them only as long as above.

## 6. Security headers in the app (next.config.ts)

Sent on every response unless noted. Each has an env switch (read at build /
start time — redeploy after changing).

| Header | Mode | Switch |
|---|---|---|
| `X-Content-Type-Options: nosniff` | enforced | `SECURITY_HEADERS=off` (all) |
| `Referrer-Policy: strict-origin-when-cross-origin` | enforced (browser default anyway) | `SECURITY_HEADERS=off` |
| `Permissions-Policy` (geolocation, usb, serial, hid, bluetooth, midi off) | enforced | `SECURITY_HEADERS=off` |
| `Strict-Transport-Security: max-age=31536000` (production only, no subdomains) | enforced | `SECURITY_HSTS=off` |
| `X-Frame-Options: SAMEORIGIN` — pages only, not `/embed/*` or `/api/*` | enforced | `SECURITY_FRAME_GUARD=off` |
| `Content-Security-Policy-Report-Only` — pages only | **report-only** | `CSP_REPORT=off`; `CSP_ENFORCE=on` to enforce |

CSP reports go to `/api/security/csp-report`, which writes nothing to the
database — it counts in memory and logs `[csp-report] <directive> <host> ×N`
the 1st, 10th, 100th… time. Before setting `CSP_ENFORCE=on`, read those log
lines for a couple of weeks and add every legitimate host to the policy.
Note: ad HTML runs in `<iframe srcDoc>`, which **inherits the page's CSP** —
an enforced policy that misses an ad network's host will blank that ad.
