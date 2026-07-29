# Social Task Auto-Verification — Admin Setup Guide

The platform can **auto-verify** social JOIN tasks so users can't fake them: a bot
you control confirms the user actually joined your Telegram channel/group or
Discord server. This is **dormant** until you complete the one-time setup below.
Nothing auto-approves until it's configured — everything falls back to normal
manual review, never a silent pass.

> Related built-in method (no setup needed): **"Auto-verify by code in content"**
> on comment/post/review actions — the server fetches the user's public link and
> checks their unique code. That works out of the box; this doc is only for the
> **Telegram/Discord membership** bots.

---

## 0. Prerequisite — your app domain

Callbacks use `NEXT_PUBLIC_APP_URL`. It **must** be your real HTTPS domain
(e.g. `https://yourdomain.com`), not `localhost`, or linking will fail.

Callback URLs the code exposes:
- Telegram: `https://yourdomain.com/api/integrations/telegram/callback`
- Discord:  `https://yourdomain.com/api/integrations/discord/callback`

---

## 1. Telegram

### a. Create the bot
1. In Telegram, open **@BotFather** → send `/newbot`.
2. Give it a name + a username (must end in `bot`, e.g. `MyEarnVerifyBot`).
3. BotFather returns a **bot token** like `123456:ABC-DEF...`. Save it.

### b. Set the login domain (required for the profile "Link Telegram" widget)
1. @BotFather → `/setdomain` → pick your bot.
2. Send your domain: `https://yourdomain.com`.
   (Without this the Telegram Login Widget silently refuses to render.)

### c. Add the bot to the target channel/group
- Add the bot to the channel/group users must join, and make it an
  **administrator** (for channels this is required for membership lookups).

### d. Paste credentials in the app
Admin → **Settings → Integrations → "Social task verification (bots)"**:
- **Telegram bot token** → the token from step (a).
- **Telegram bot username** → the username **without `@`** (e.g. `MyEarnVerifyBot`).
  (This one is read only from Settings — no env-var fallback.)

### e. Find each task's "Verify target"
- **Public channel:** use `@channelusername`.
- **Private channel / group:** the numeric chat id, e.g. `-1001234567890`.
  Get it by forwarding a channel message to **@userinfobot**, or from the bot's
  `getUpdates`.

---

## 2. Discord

### a. Create the application + get OAuth creds
1. Go to the **Discord Developer Portal** → **New Application**.
2. **OAuth2** page → copy **Client ID** and **Client Secret**.
3. **OAuth2 → Redirects** → add:
   `https://yourdomain.com/api/integrations/discord/callback`

### b. Create the bot
1. **Bot** tab → **Add Bot** → copy the **Bot Token**.
2. Under **Privileged Gateway Intents**, enable **Server Members Intent**
   (required to read guild membership).

### c. Invite the bot to your server
- **OAuth2 → URL Generator** → scope **`bot`** → open the generated URL → add the
  bot to the server users must join.

### d. Paste credentials in the app
Admin → **Settings → Integrations → "Social task verification (bots)"**:
- **Discord client ID**, **Discord client secret**, **Discord bot token**.

### e. Find each task's "Verify target"
- The **server (guild) id**: Discord → **Settings → Advanced → Developer Mode ON**,
  then right-click the server → **Copy Server ID**.

---

## 3. Configure a task (per JOIN task)

Admin → create/edit a **SOCIAL** task:
1. Platform **Telegram** → action `JOIN_CHANNEL` or `JOIN_GROUP`, **or**
   platform **Discord** → action `JOIN_SERVER`.
2. On that action, turn on **"Auto-verify membership (bot)"**.
3. Fill **Verify target**:
   - Telegram → `@channelusername` or the numeric chat id (`-100…`).
   - Discord → the server (guild) id.
4. Save.

---

## 4. What the user does

Profile → **"Verified Accounts"**:
- **Link Telegram** (one-tap Login Widget) / **Link Discord** (OAuth).
- Then join the channel/server and submit the task.
- The server calls the bot (`getChatMember` / guild member lookup); if the linked
  account is a member → **auto-approved**. If not → stays for manual review.

---

## 5. Env-var alternative (optional)

`getSecret` checks environment variables before the Settings row, so you may
instead set these env vars (except the Telegram username, which is Settings-only):

```
TELEGRAM_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
# Telegram bot username has NO env fallback — set it in Settings → Integrations.
```

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Link Telegram" button doesn't appear | Bot username not set, or `/setdomain` not done, or `NEXT_PUBLIC_APP_URL` wrong |
| Telegram result "couldn't verify" (manual) | Bot not in the channel/group, or wrong Verify target chat id |
| Discord "couldn't verify" (manual) | Server Members Intent off, bot not in the guild, wrong bot token, or wrong guild id |
| Linking redirects with `status=error` | `reason` query param says why (`not_configured`, `bad_signature`, `bad_state`, `expired`, …) |
| Nothing auto-approves | Feature is dormant until tokens + per-task Verify target are set — this is expected/safe |

Every failure path falls back to **manual review** — a broken/missing setup never
auto-approves a fraudulent submission.
