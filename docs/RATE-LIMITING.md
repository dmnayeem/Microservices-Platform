# Rate limiting & abuse protection

Three layers, each doing a different job. Use the right one — they are not
interchangeable.

| Layer | Where | Use for |
|---|---|---|
| **Vercel Firewall** | Vercel dashboard, before any function runs | Broad per-IP flood protection. Costs zero DB load. |
| **`enforceDbRateLimit`** (`src/lib/rate-limit-db.ts`) | Postgres counter, shared across instances | Anywhere money moves or points are paid. |
| **`enforceRateLimit`** (`src/lib/rate-limit.ts`) | In-memory, per instance | Cheap speed bump on auth endpoints. **Not a real bound.** |

## Why the in-memory limiter is not enough

Its counters live in a module-scope `Map`. On Vercel every serverless instance
gets its own, and the platform adds instances under exactly the load an attacker
generates — so the effective limit is `limit × instances`, and the attacker
controls the instance count. It is a speed bump, nothing more.

That is why the money routes use the Postgres-backed limiter, which every
instance shares.

## The IP-spoofing bug (fixed 2026-08-20)

`clientIp()` used to read the **leftmost** entry of `x-forwarded-for`. That header
is a list each proxy *appends* to, so the leftmost value is whatever the caller
typed — meaning every IP-keyed limiter in the app could be defeated by sending a
random `X-Forwarded-For` per request.

It now prefers `x-vercel-forwarded-for` (written by our own edge), then
`x-real-ip`, then the **rightmost** XFF hop. If you ever deploy behind a different
proxy, revisit this function — the rule is "trust only the hop your own
infrastructure wrote".

## What is limited in code today

| Route | Limit | Why |
|---|---|---|
| `/api/ads/serve` | 120/min per user | A GET that does 4 reads and counts an impression. Unthrottled it both loads the DB and **corrupts advertiser impression figures**. |
| `/api/feed/[id]/like` | 60/min | Credits real points via `awardSocialEarning` — an unthrottled loop is a points-farming exploit. |
| `/api/feed` POST | 20/min | ~20 DB ops plus a server-side outbound fetch for the link preview. A DoS amplifier as well as a spam vector. |
| `/api/search` | 60/min | Four parallel `contains` scans per call. |
| `/api/withdrawals` POST | 10/min | Money. |
| `/api/deposits` POST | 10/min | Money. |
| `*/claim` (browse-earn, daily-mission, events, milestones, solo-reward) | 30/min | Reward claims. |
| auth routes (register, login-check, forgot/reset password) | existing | In-memory limiter — now that `clientIp()` is fixed, these actually work per IP. |

**Correctness never depends on a limiter.** `withIdempotency` and the
`@@unique([userId, reference])` ledger constraints are what prevent double-pay.
The limiters exist so the database isn't the thing absorbing an attack.

## Vercel Firewall rules to add (owner action)

Project → **Firewall** → *Configure* → add these as rate-limit rules. All are per
IP. These numbers are deliberately generous — they are an abuse ceiling, not a
product rule.

| # | Match | Action |
|---|---|---|
| 1 | Path starts with `/api/spaces/panel` **or** `/api/ads/serve` | Rate limit **300 / 1 min** → challenge |
| 2 | Path starts with `/api/search` | Rate limit **120 / 1 min** → challenge |
| 3 | Path starts with `/api/upload` | Rate limit **60 / 1 min** → deny |
| 4 | Path starts with `/api/withdrawal-ticker/stream` | Rate limit **10 / 1 min** → deny (each connection holds a function open for 5 min) |
| 5 | Path starts with `/api/auth` | Rate limit **60 / 1 min** → challenge |
| 6 | Path starts with `/api/` and method is `POST` | Rate limit **600 / 1 min** → challenge (catch-all) |

Prefer **challenge** over **deny** on user-facing paths: a real user behind a
shared/carrier NAT can trip these, and a challenge lets them through while a
script does not.

## Adding a limiter to a new route

```ts
import { enforceDbRateLimit } from "@/lib/rate-limit-db";

const limited = await enforceDbRateLimit(request, "scope-name", session.user.id, 30, 60_000);
if (limited) return limited;
```

Limits per **user** when authenticated (an attacker can rotate IPs but not
accounts), falling back to IP otherwise. It **fails open** — if the limiter's own
query fails, the request is allowed, because a database blip must not lock
everyone out of withdrawing their money.

Counters live in `RateLimitHit` and are pruned by the nightly retention job.
