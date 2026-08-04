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
