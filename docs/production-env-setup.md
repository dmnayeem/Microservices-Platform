# Production env setup — remaining keys

These are the only env vars still needed to turn on optional features. Each can be
issued **only from your own account** at the linked provider — paste the values into
`.env` (local) and into your host's environment variables (production).

Already done for you (in local `.env`): **web-push** (`VAPID_*`), `WELCOME_BONUS_POINTS`,
`NEXT_PUBLIC_APP_URL`. See the last section for what to carry to production.

> Tip: nothing here blocks the app from running — each feature simply stays off
> ("not configured" / manual fallback) until its keys are set.

---

## 1. SSLCommerz — card/mobile-banking deposits & withdrawals
Unlocks: automated gateway payments (otherwise deposits fall back to manual review).
Get it: sign in to the **SSLCommerz merchant panel** (https://developer.sslcommerz.com —
sandbox first, then live). Copy your Store ID and Store Password.

```env
SSLCOMMERZ_STORE_ID="your_store_id"
SSLCOMMERZ_STORE_PASSWD="your_store_password"
SSLCOMMERZ_SANDBOX="true"   # "false" when you go live
```
Alternative: these can also be set from the **Admin panel → Settings** instead of env.

## 2. bKash (PGW) — bKash deposits/withdrawals
Unlocks: bKash payments. Get it: **bKash PGW merchant onboarding** → API credentials
(sandbox creds first, then production).

```env
BKASH_APP_KEY="your_app_key"
BKASH_APP_SECRET="your_app_secret"
BKASH_USERNAME="your_username"
BKASH_PASSWORD="your_password"
BKASH_SANDBOX="true"   # "false" when you go live
```

## 3. Firebase — phone-number OTP (sign-in / verification)
Unlocks: phone OTP. Get it: **Firebase Console → Project settings → Service accounts →
Generate new private key** (downloads a JSON). Copy three fields out of that JSON.

```env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com"
# Keep the literal \n sequences and the surrounding quotes exactly as below:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n"
```
Note: the private key is multi-line — wrap it in double quotes and keep the `\n`
escapes (don't paste real line breaks).

## 4. Inngest — background jobs (crons)
Unlocks (in production): lottery draw, subscription auto-expiry, escrow deal
auto-release, log-retention pruning. **Local dev needs no keys** — run
`npx inngest-cli@latest dev`. For production create an app at https://app.inngest.com
and copy both keys.

```env
INNGEST_EVENT_KEY="your_event_key"
INNGEST_SIGNING_KEY="signkey-prod-xxxxxxxx"
```

## 5. Sentry — error tracking & slow-query visibility (recommended before launch)

Unlocks: grouped error reports, and per-endpoint tracing that shows **which database
query is slow**. It matters for this app specifically because the code is built to
degrade quietly — `src/lib/prisma.ts` retries a failing read up to four times, and
`safeRead` swallows non-critical failures so the page still renders. Both are right
for the user and blinding for you: without Sentry, a database sliding into trouble
produces no signal until users complain.

### What the DSN actually is

**D**ata **S**ource **N**ame — an address and a key in one string. It tells the SDK
*where* to send reports and *which project* they belong to:

```
https://abc123def@o1234567.ingest.sentry.io/7654321
        └─ key ─┘  └─ your org ─┘            └─ project ─┘
```

In this repo it doubles as the on/off switch: the configs are written as
`enabled: !!process.env.SENTRY_DSN`, so with no DSN the SDK never initialises —
zero cost, nothing in the build output. Add the DSN and it turns on with no code
change.

**The DSN is not a password.** That is why `NEXT_PUBLIC_SENTRY_DSN` is shipped to
the browser — it has to be, for browser errors to reach Sentry at all. Someone who
reads it can *send* fake events to your project (annoying, not dangerous); they
cannot *read* your errors, which requires signing in to the account.

**Skipping it breaks nothing.** The app already ships an in-house version at
`/api/admin/db-health` (retry counts, degraded reads) and `/api/health` (is the DB
up). Sentry is an upgrade on top, not a dependency.

**Cost: free.** Sentry's free "Developer" plan covers ~5,000 errors and 10,000 trace
units a month with no card. If you exceed it, events are dropped — nothing breaks and
you are not billed.

### Getting the DSN — about 3 minutes

1. Go to **https://sentry.io/signup/** and create an account (sign in with GitHub or
   Google is fastest). Free plan is selected by default.
2. When it asks what you are building, choose **Next.js** as the platform, and name
   the project (e.g. `earngpt`).
3. Sentry then shows an install wizard. **Skip it — the code is already wired up**
   (`sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`,
   `src/instrumentation.ts`). You only need the DSN.
4. Copy the **DSN**. It looks like
   `https://abc123def456@o1234567.ingest.sentry.io/7654321`.
   To find it again later: **Settings → Projects → [your project] → Client Keys (DSN)**.

### Where to put it

The **same DSN value** goes in both variables — one is read on the server, one is
shipped to the browser:

```env
SENTRY_DSN="https://abc123@o123456.ingest.sentry.io/7654321"
NEXT_PUBLIC_SENTRY_DSN="https://abc123@o123456.ingest.sentry.io/7654321"
# Fraction of requests traced. 0.1 = 10%. Raise while investigating, lower after.
SENTRY_TRACES_SAMPLE_RATE="0.1"
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.05"
```

**In Vercel:** Project → **Settings** → **Environment Variables** → add each name and
value → tick **Production** (and Preview if you want it there too) → Save.

⚠️ **Then redeploy.** Vercel bakes env vars in at build time, so pasting them without
a new deployment changes nothing. Deployments → latest → ⋯ → **Redeploy**.

### Checking it worked

After the redeploy, open Sentry → **Issues**. Errors appear there as they happen. If
you want to force one, visit a URL that 500s. Nothing showing up usually means the
redeploy was skipped, or the DSN went into the wrong environment.

### One deliberate choice

**Session Replay is off.** It records what the user sees, and this app shows
balances, payout details and KYC data on screen. Turn it on only if you decide that
is acceptable.

---

## Carry to production (already set locally)
When you deploy, set these in your host's env too:

- **`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`** — copy the **same**
  values from local `.env`. ⚠️ Do NOT regenerate for prod — a new keypair invalidates
  every existing push subscription.
- **`NEXT_PUBLIC_APP_URL`** and **`NEXTAUTH_URL`** — set both to your real domain
  (e.g. `https://app.yourdomain.com`), not `localhost`.
- Also ensure the already-configured secrets (DATABASE_URL, NEXTAUTH_SECRET, Google
  OAuth, SMTP, AWS S3, GEMINI) exist in the production env.
