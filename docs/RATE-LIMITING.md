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

## Vercel Firewall rules

Run **`bash scripts/apply-firewall.sh`** — it creates these through the Vercel
CLI, shows you a diff, and publishes. Rules cannot live in `vercel.json`: its
`mitigate` property supports only `challenge` and `deny`, not rate limits.

All are per IP. The numbers are deliberately generous — an abuse ceiling, not a
product rule. They are listed **in priority order**, because Vercel's plan limits
are strict: **Hobby allows one rate-limit rule and three custom rules per
project**; Pro allows forty. The script applies them in this order and stops
cleanly when the plan refuses the next one, so on Hobby you get rule 1 and a
clear message about the rest.

| # | Match | Limit | Action | Why |
|---|---|---|---|---|
| 1 | Path starts with `/api/` **and** method is `POST` | 600 / 60s | challenge | The catch-all, and the one to keep if only one is allowed. Every write in the app is a POST, so this covers withdrawal, checkout, claim and submit at once — including routes not written yet. |
| 2 | Path starts with `/api/auth` | 60 / 60s | challenge | Credential stuffing. The in-memory limiter on these routes is per-instance and is not a real bound (see above). |
| 3 | Path starts with `/api/media` | 600 / 60s | challenge | The private-bucket proxy every image and video is streamed through. This is the one endpoint that bills real S3 egress on somebody else's traffic. |
| 4 | Path starts with `/api/upload` | 60 / 60s | deny | S3 writes, up to 5 MB each. Deny rather than challenge — nothing legitimate uploads sixty files a minute. |
| 5 | Path starts with `/api/ads/serve` | 300 / 60s | challenge | Hit on every page view. A flood loads the database *and* corrupts advertiser impression figures. |
| 6 | Path starts with `/api/search` | 120 / 60s | challenge | Four parallel `contains` scans per call. |

Prefer **challenge** over **deny** on user-facing paths: a real user behind a
shared/carrier NAT can trip these, and a challenge lets them through while a
script does not.

### A note on keeping this list honest

Two earlier rules pointed at routes that no longer existed — a *spaces panel*
and a *withdrawal-ticker stream* — and one of them was justified by an SSE
endpoint the codebase no longer has (`grep -rl text/event-stream src/app/api`
returns nothing; the ticker is polled via `.../recent`). A firewall rule matching
a dead path is worse than no rule: it reads as coverage. Meanwhile the busiest
paid endpoint on the platform, the media proxy, was not covered at all.

`scripts/verify-launch-todos.ts` now asserts that every path named in this table
resolves to a real route under `src/app/api`, so this cannot drift again.

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
