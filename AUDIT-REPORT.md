# EarnGPT ("Microservices-Platform") — Deep Code Audit
**Date:** July 23, 2026 · Full codebase review (~700 source files, 109 Prisma models)

---

## ✅ P0 Remediation — July 25, 2026 (critical money/security — all FIXED, verified tsc+eslint+build)

| ID | Fix landed |
|---|---|
| C1 | SSLCommerz callback now validated server-side via the validator API (`val_id` + `tran_id` + amount cross-check); forged `status=success` no longer credits. |
| C2 | Withdrawal reject now refunds the exact held **points** (from the original WITHDRAWAL txn), not cashBalance. |
| C3 | Withdrawal creation wrapped in one `$transaction` with a `pointsBalance >= needed` CAS — no overdraft race. |
| C4 | bKash now converts USD→BDT at the admin-set `bkash.usdToBdtRate` before charging (was ~123× undercharge). |
| C5 | Lottery draw uses crypto `randomInt` Fisher-Yates, a status **CAS inside `$transaction`** (draws once — admin+cron safe), and `@@unique([lotteryId,ticketNumber])`. |
| C6 | `prisma/seed.ts` refuses to run unless `ALLOW_SEED=true` and `NODE_ENV!=production`. |
| H8 | `Deposit.txnId @unique` (+ `@@index([status,createdAt])`) — no double-approve. |
| H7 | `admin/submissions`, `ads/[id]/reward`, `admin/users/bulk` now use `getPointsPerUsd()` (no hardcoded `*0.001`). |
| H2 | 2FA disable now **requires** a valid current TOTP code (empty body rejected). |
| H1 | In-memory sliding-window rate limiter (`src/lib/rate-limit.ts`) on login-check/register/forgot/reset-password. |
| H3 | Offerwall callback requires an HMAC over all money fields (incl. payoutAmount), timing-safe; plaintext-secret path removed. |
| H4 | KYC image fetch is host-allowlisted (S3/CloudFront + `KYC_IMAGE_HOSTS`), blocks private/metadata IPs, no redirects (SSRF closed). |
| H5 | Auction settlement debits the winner with a `cashBalance >= amount` CAS in an interactive `$transaction`; voids the sale (no seller payout) if the winner can't cover. |
| H6 | Impersonation now writes an `IMPERSONATE_START` audit log attributing it to the admin. |
| NEW | Ad-click billing requires auth + a per-(user,ad) cooldown (anti click-fraud); boost uses balance+`isPinned` CAS; funded-task payout draws the budget **before** crediting (no unfunded mint). |

**Still staged (not this pass):** P1 DB indexes + caching + N+1, P2 frontend perf + responsiveness, P3 Float→Decimal + tech-debt — see the prioritized plan.

---

## 1. What the project is

Despite the folder name, this is **not** a microservices system — it's a single **Next.js 16 (App Router) monolith** called `earngpt`, deployed on **Vercel**, backed by **PostgreSQL via Prisma 7 + Prisma Accelerate**. It's a Bangladeshi social-earning platform (PWA) where users earn points by completing tasks and withdraw real money.

**Stack:** Next.js 16 · React 19 · NextAuth v5 (JWT sessions, no DB sessions) · Prisma 7 + Accelerate · Tailwind 4 · Zustand · Inngest (background jobs) · AWS S3 + Rekognition (KYC) · Google Gemini (AI) · web-push + OneSignal · SSLCommerz + bKash (payments) · Upstash Redis (installed but unused).

**Domains (109 models):**

| Domain | What it does |
|---|---|
| Earning/Tasks | Social tasks, article tasks (HMAC-tokenized), video tasks, app-install tasks, surveys, quizzes, daily missions, task boards, offerwalls |
| Wallet/Finance | Dual currency: `pointsBalance` (Int, earning) + `cashBalance` (Float, USD). Transactions, Withdrawals (bKash/Nagad rails), Deposits, referral commissions (3 levels) |
| Courses/LMS | Full LMS: modules, lessons, live classes, quizzes, certificates, coupons, refunds, tutor applications, 20% commission |
| Marketplace | Listings, direct checkout, auctions/bids, carts, disputes, 5% commission |
| Social | Posts/feed, comments, likes, follows, groups, chat, mentions, notifications, social-action earnings |
| Ads | Advertiser campaigns, placements, ad networks, CPC billing, video ads |
| Other | Lottery, packages/subscriptions, KYC (auto via Rekognition + Gemini), RBAC admin panel, impersonation, gamification |

**Auth architecture:** JWT-only sessions (30-day), role embedded in token. `middleware.ts` does edge route-protection; each API route re-checks `auth()` + `hasPermission()` inline. Admin panel gated by role. Impersonation is SUPER_ADMIN-only, single-use 5-min token.

**What's done well:** article-task key claiming uses `FOR UPDATE SKIP LOCKED` (excellent); ad-view rewards use row locks; marketplace direct checkout uses atomic CAS with balance guards; trending/user-rank properly cached; password handling is sound (bcrypt 12, no enumeration); parameterized raw SQL everywhere; no secrets committed; service worker design is mostly correct.

---

## 2. CRITICAL — fix these first (money can be stolen today)

### C1. Anyone can mint free money via the SSLCommerz callback ⚠️
`src/lib/payments/sslcommerz.ts:66-72` + `src/app/api/deposits/gateway/callback/route.ts`
The callback trusts the **client-supplied** `status` query param and never validates against SSLCommerz's server (`val_id` is never checked — the code comment admits it). The route is unauthenticated and accepts GET.
**Attack:** call `/api/deposits/gateway/init` with `amount: 10000` → then `GET /api/deposits/gateway/callback?provider=sslcommerz&status=success&tran_id=dep_<uid8>_<ts>` → $10,000 credited, no payment made. The `tranId` is predictable and the attacker created it themselves.
**Fix:** validate every callback server-side against the SSLCommerz validation API before crediting.

### C2. Withdrawal rejection refunds to the WRONG currency (free-cash exploit)
`src/app/api/withdrawals/route.ts:303-307` debits **pointsBalance** when a withdrawal is created, but admin reject (`src/app/api/admin/withdrawals/[id]/route.ts:218-223`) refunds by crediting **cashBalance** with the USD amount. Every rejected withdrawal converts points → free USD cash (and the user's points are never returned). Request → let it be rejected → repeat.

### C3. Withdrawal creation is non-atomic (overdraft race)
`src/app/api/withdrawals/route.ts:273-311` — balance check, `withdrawal.create`, balance decrement, and transaction row are **4 separate calls with no `$transaction`** and no `gte` guard. Two concurrent requests both pass the check → negative balance, double withdrawal. The 24h-cooldown check is racy the same way.
**Fix:** one `$transaction` using `updateMany({ where: { id, pointsBalance: { gte: pointsNeeded } } })` as the gate.

### C4. bKash deposits charge BDT but credit USD (~123× mis-credit)
`src/lib/payments/bkash.ts:12-13,74` — no USD→BDT conversion: user pays ৳10, deposit row credits $10. SSLCommerz correctly sends `currency: "USD"`; bKash doesn't convert.

### C5. Lottery is exploitable in three ways
`src/lib/lottery.ts` + `src/app/api/lottery/route.ts`
- Draw uses `array.sort(() => Math.random() - 0.5)` — biased, non-cryptographic RNG for a real-money lottery.
- Draw is not concurrency-safe: status check is a plain read; final writes are `Promise.all`, not `$transaction`. Admin button + auto-draw cron firing together **pays every winner twice**.
- Ticket numbers come from `currentTicketCount + i + 1` with **no `@@unique([lotteryId, ticketNumber])`** — concurrent buyers get duplicate ticket numbers; balance/limit checks sit outside the transaction.

### C6. Destructive seed pointed at production
`prisma/seed.ts:15` runs `prisma.user.deleteMany({})` unconditionally and is wired into `prisma.config.ts` using the production Accelerate `DATABASE_URL`. One `npx prisma db seed` wipes every user. Add an environment guard now.

---

## 3. HIGH — security

- **H1. Zero rate limiting.** `@upstash/ratelimit` is installed but **never used**. `POST /api/auth/login-check` is an unauthenticated password oracle (returns precise reason codes, accepts OTP) — unthrottled brute-force of passwords and 2FA codes. Register / forgot-password / reset / resend-verification also unthrottled.
- **H2. 2FA can be disabled without any code.** `src/app/api/security/2fa/disable/route.ts` — `code` is `.optional()`; an empty body disables 2FA. A hijacked session strips 2FA silently. Require current TOTP + password.
- **H3. Offerwall callback accepts the plaintext secret as a "signature"** (`signature === config.secretKey`) and the HMAC omits `payoutAmount` → anyone with the secret credits arbitrary users arbitrary amounts. (`src/app/api/offerwall/[provider]/callback/route.ts:69-78`)
- **H4. KYC auto-verify SSRF.** `src/app/api/kyc/auto/route.ts` accepts arbitrary URLs and the server fetches them (`src/lib/kyc/image-bytes.ts`) — internal network probing (169.254.169.254 etc.). Restrict to your own S3/CDN host.
- **H5. Auction settlement has no balance guard/escrow.** `src/lib/marketplace-auctions.ts:143-146` — bids are never escrowed and the winner's debit has no `gte` guard; seller still gets paid → platform eats negative balances. (Direct checkout does this correctly — copy that pattern.)
- **H6. Impersonation leaves no audit trail.** No `auditLog` entry, no `impersonatedBy` claim in the minted JWT — admin actions are indistinguishable from the victim's own.
- **H7. Hardcoded `points * 0.001` USD conversion** in `admin/submissions/[id]/route.ts:206` and `ads/[id]/reward/route.ts:53` ignores the admin-configurable `points_per_usd` — silent accounting divergence if the rate changes.
- **H8. `Deposit.txnId` not unique** — the same bKash/Nagad transaction ID can be submitted and approved twice on the manual deposit path.

---

## 4. Database optimization gaps

**Money as Float.** `cashBalance`, `Transaction.amount`, `Withdrawal.amount/fee/netAmount`, prices — all `Float`, mutated by increment/decrement, so binary drift accumulates in a real-money ledger. Parts of the code already use cents-Int (`totalRevenueCents`) — finish that migration or move to `Decimal(12,2)`.

**Missing indexes (highest traffic first):**

| Model | Add | Why |
|---|---|---|
| Notification | `@@index([userId, isRead])`, `@@index([userId, createdAt])` | polled by every client every 30s (twice) |
| ChatMessage | `@@index([conversationId, createdAt])`, `@@index([conversationId, read])` | 8s chat polls; current lone `[createdAt]` global index is dead weight |
| LotteryTicket | `@@unique([lotteryId, ticketNumber])`, `@@index([lotteryId, userId])` | correctness + per-user limit |
| Deposit | `@unique` on `txnId`, `@@index([status, createdAt])` | dedupe + admin queue |
| QuizAttempt | `@@index([quizId, userId])` | attempt-limit check |
| AuditLog | `@@index([entity, entityId])` | per-record history |
| Post | `@@index([isPublic, isPinned, createdAt])` | feed orders by pinned-first; current index can't serve it |
| ReferralEarning | index + relation on `referredUserId` | currently scans |

**Fake uniqueness:** `TaskSubmission @@unique([taskId, userId, createdAt])` guarantees nothing (createdAt always differs) — duplicate concurrent submissions of non-repeatable tasks are possible; daily-limit checks are check-then-act.

**Fragile ledger queries:** transaction aggregation via `description: { contains: "lottery" }` and `reference: { startsWith: "social_" }` — unindexable and breaks if copy changes. Add a typed `sourceType` enum column. `Transaction.reference` isn't unique, so it can't backstop idempotency either.

**Other:** `CourseListingView` dedupes with find-then-create (race; MarketplaceListingView has the correct `@@unique` — copy it). User model is ~90 columns wide mixing hot counters with cold profile data — consider a `UserStats` split. No `prisma/migrations` directory — schema evolves via `db push` (no rollback trail).

---

## 5. Backend / API performance gaps

**Unbounded queries that grow forever:**
- `/api/transactions` loads a user's **entire** transaction history to sum in JS → `groupBy(type, _sum)` (same in `/api/wallet`, solo-reward status/claim).
- `/api/referrals` + referrals page + wallet page fetch the entire 3-level downline (thousands of rows) sequentially, paginate in JS → `groupBy`/`aggregate` + DB pagination.
- Admin dashboard buckets **all** users/subscriptions since 7/30 days in JS; admin analytics export includes full user rows unbounded.
- `?limit=` is unclamped on `/api/feed`, `/api/tasks`, `/api/notifications` — `?limit=10000` works.

**N+1 patterns:**
- `/api/leaderboard`: per-user `user.count` + `taskSubmission.count` loops — up to 200 queries/request. And the "combined" board **recomputes the whole 500-user pipeline twice** when the viewer isn't in the top N — with zero caching on data identical for every user. This is likely your single most expensive endpoint.
- `/api/tasks`: per-task submission-count loop (20+ queries/page) + the same user row fetched twice.
- `/api/lottery`: per-lottery ticket count despite a `ticketsSold` counter existing.

**Missing caching (the biggest systemic gap):**
- `getSetting()` (`src/lib/system-settings.ts`) hits the DB on **every call**, and it's called on every ads request, splash, and 3×/feed render. You already wrote the right pattern (in-memory TTL in `economy.ts`) — apply it inside `getSetting`.
- `getEffectiveFeatures()`/`defaultPackage()` run 2 uncached queries on **every navigation** (in `(main)/layout.tsx`) and 7 pages fetch it again in the same request → wrap in `React.cache()` + memo the default package.
- Only 2 files in the whole app use Accelerate `cacheStrategy`; `export const revalidate = 30` on the admin dashboard is **dead code** (page calls `auth()` so it's always dynamic) → use `unstable_cache` for the stats block (~29 queries/load → ~0 amortized).
- `courses/[slug]` and `offer/[slug]`: `generateMetadata` + page both call the loader → ~16 queries, ~12 serialized round-trips per view → wrap loaders in `React.cache()`.

**Request-path work that belongs in Inngest (which you already have):**
- `notifyUser` awaits web-push delivery to all subscriptions inside the task-submit hot path.
- Admin bulk notification SMTP loop runs in the request (will hit Vercel timeouts).
- `awardSocialEarning` (~10 queries) awaited inside the like endpoint.

**Chat/realtime:** each open chat polls the full 200-message history every 8s **and POSTs /read every 8s** (a DB write per poll). Add `?since=` incremental fetch. The withdrawal ticker SSE runs one identical DB query per connected client every 8s → share one poller or add `cacheStrategy: { ttl: 8 }`.

**Render-time side effects:** `getKycPromptState` performs `updateMany` + notifications during GET render on 5 pages — moves to an action.

---

## 6. Frontend performance gaps

**Polling load:** an idle user generates ~480-600 requests/hour. Header and BottomTabBar **independently** poll notifications every 30s (BottomTabBar polls even on desktop where it's CSS-hidden), plus wallet, plus 17 `useAutoRefresh` pages. Consolidate into one shared fetcher; also `useAutoRefresh` double-fires on tab return (both `focus` and `visibilitychange`).

**Bugs:**
- **Chat flickers every 8s**: each poll sets `loading=true` and the render gates the whole list on `!loading` → conversation collapses to a spinner every poll, and scroll yanks. Make polls silent.
- Quiz auto-submit at timeLeft=0 has no retry/guard — a failed fetch strands the quiz at 0:00 forever; countdown recreates its interval every second.
- Bid panel computes "auction ended" only at render — users appear able to bid after end.
- `src/stores/user-store.ts` is dead code that persists balances to localStorage — delete it.
- `use-auto-refresh` doc says 15s, code says 30s (copy-pasted wrong in several call sites).
- Service worker: offline shell `"/"` is cached at install and never refreshed → months later the offline page references purged chunks; notification-click focuses an arbitrary tab.

**Bundle:**
- `framer-motion` is statically imported in `(main)/template.tsx` for a 0.18s fade wrapping every page → replace with CSS, save ~35KB gzip from the shared bundle.
- Recharts statically imported into the admin dashboard; TipTap into offer-editor; qrcode into referrals — all should be `next/dynamic` (react-player already is — the only dynamic imports in the repo).
- 2,754-line `social-feed-view.tsx` and 2,972-line `profile-view.tsx` are single "use client" files; `PostCard` isn't memoized so one like re-renders every loaded post; no virtualization on infinite scroll.
- 78 files use raw `<img>` vs 7 using `next/image`; `next.config.ts` has no `images` config; feed images load full-size originals without `loading="lazy"`.

**Streaming:** exactly one page uses `<Suspense>`. Feed (~13-15 queries) and admin dashboard (~29 queries) block TTFB on their slowest query — add streaming shells.

---

## 7. Prioritized action plan

**This week (money/security):**
1. Validate SSLCommerz callbacks server-side (C1) — highest priority, exploitable remotely today.
2. Fix withdrawal-reject refund currency (C2) + wrap withdrawal creation in a guarded `$transaction` (C3).
3. Fix bKash currency conversion (C4).
4. Guard `prisma/seed.ts` against production (C6) — 5-minute fix.
5. Add Upstash rate limiting to login-check/register/forgot-password/OTP/withdrawals (H1).
6. Require TOTP to disable 2FA (H2). Fix offerwall signature (H3). Whitelist KYC image hosts (H4).
7. Lottery: `$transaction` + CAS on draw, crypto shuffle, unique ticket numbers (C5).

**Next 2 weeks (DB + hot paths):**
8. Add the missing indexes (Notification and ChatMessage first — they serve the 30s/8s polls).
9. Kill the unbounded reads: transactions summary, referrals tree, admin dashboard series → `groupBy`/`aggregate`; clamp all `limit` params.
10. Cache `getSetting`, `getEffectiveFeatures`, `defaultPackage`, leaderboard (60s), admin stats (`unstable_cache`).
11. Fix leaderboard N+1s and double-compute.
12. Move push/email delivery and social-earning credit to Inngest.

**Next month (product quality):**
13. Consolidate client polling; fix chat flicker + incremental fetch.
14. Bundle work: CSS transitions, dynamic-import recharts/tiptap/qrcode, memoize PostCard, adopt next/image.
15. Migrate money columns Float → Decimal/cents; add typed `sourceType` to Transaction; adopt real Prisma migrations.
16. Add impersonation audit logging.
