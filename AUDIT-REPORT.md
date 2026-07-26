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

## ✅ P1 Remediation — July 25, 2026 (DB indexes + hot-path caching + N+1 — FIXED, verified)

- **Indexes added** (db push): Notification `[userId,isRead]`+`[userId,createdAt]`, ChatMessage `[conversationId,createdAt]`, Post `[isPublic,isHidden,isPinned,createdAt]`, QuizAttempt `[quizId,userId]`, ReferralEarning `[referredUserId]`+`[userId,level]`, SocialReport `[status,contentType]`+`[contentType,contentId]`, AuditLog `[entity,entityId]`, Ad `[placementId,status]`, Task `[fundedByUserId]`, AdCampaign `[status,startAt,endAt]`.
- **Caching:** `getSetting` now in-memory TTL (45s) + `invalidateSettingsCache()` wired into all 7 settings-writer routes → eliminates ~2 DB reads per ad-serve + per-feed setting reads. `getEffectiveFeatures` wrapped in `React.cache()` (per-request dedupe across layout+pages); `defaultPackage` module TTL (60s). Leaderboard combined board wrapped in `unstable_cache(60s)`; `getEligiblePackages` routed through cached getSetting.
- **N+1 / unbounded killed:** `/api/transactions` + `/api/wallet` sums via `groupBy`/`aggregate` (no full-history load); `/api/referrals` earnings/counts via groupBy + DB-paginated downline; `/api/tasks` per-task submission counts via one groupBy. `?limit` clamped to ≤100 on feed/tasks/notifications/transactions/referrals.
- **Remaining P1 (minor, deferred):** admin-dashboard stats `unstable_cache`; leaderboard viewer-rank double-compute for out-of-top-N (board itself now cached).

---

## ✅ P2 Remediation — July 25, 2026 (frontend perf + mobile responsiveness — FIXED, verified tsc+eslint+build)

- **Polling halved:** the mobile `BottomTabBar` no longer polls `/api/notifications` on desktop (gated behind a `matchMedia` mobile check) — the `Header` is now the single site-wide notification poller. `useAutoRefresh` had a `focus`+`visibilitychange` double-fire on every tab-return; a 1s coalescing guard collapses it to one run.
- **Shared bundle slimmed:** framer-motion removed from the app-wide page wrappers (`(main)/template.tsx` + `PageTransition`) in favour of pure-CSS keyframes (`.animate-page-fade`/`.animate-page-slide`, honouring `prefers-reduced-motion`) — template.tsx is now a server component. `recharts` (revenue-trend, user-growth, analytics-charts) and `tiptap` (offers rich-text editor) are now `next/dynamic({ ssr:false })` with skeleton fallbacks; `qrcode` is lazy-`import()`ed only when the referral QR panel renders.
- **Feed re-render fixed:** `FeedPostCard` wrapped in `React.memo` with stable (`useCallback`) id-scoped update/delete handlers, so liking/interacting with one post no longer re-renders every loaded post.
- **Chat flicker fixed:** the 8s poll no longer flips `loading` (silent refresh) — the thread stopped collapsing to a spinner every poll; `/read` now fires only when a new incoming message arrives (not every poll).
- **Mobile responsive quick-fixes:** audience-builder age/level grid `grid-cols-2 sm:grid-cols-4`, referral-tree per-level grid `grid-cols-3 sm:grid-cols-5 md:grid-cols-10`, quiz AI-generator modal `max-h-[90vh] overflow-y-auto`.
- **Deferred to P3:** `survey-responses-view` recharts split (4 inline charts, rare admin route), full `next/image` sweep (78 `<img>`), splitting the 2.7k/2.9k-line client files, remaining raw admin-table migrations, chat `?since=` incremental fetch.

---

## ✅ P3 Remediation — July 25, 2026 (tech-debt cleanup + Float→Decimal money migration — DONE, verified tsc+eslint+build)

**Commit A — safe cleanup:**
- Deleted zero-reference dead code (`src/stores/user-store.ts`, `src/components/admin/coming-soon.tsx`).
- `safeJsonParse<T>()` helper (`src/lib/safe-json.ts`) applied at all lottery ticket/winning-number
  `JSON.parse` sites (malformed rows → `[]`/`null`, not a 500); guarded the unprotected `prizes` Json cast in
  `lottery.ts` (its mapping loop ran outside any try/catch) with a new `no_prizes` draw reason.
- `Transaction @@index([reference])` (non-unique — marketplace/course double-entry deliberately shares a
  reference; unique idempotency deferred). `ReferralEarning.sourceType String` → `ReferralSourceType` enum.

**Commit B — Float→Decimal money migration:**
- **37 money columns across 30 models** `Float` → `Decimal @db.Decimal(18,6)` (staged in 5 model-groups:
  core wallet → payouts → earn config → packages/marketplace → courses). Left as `Float` (documented):
  the 4 semantically-mixed rate fields (`Campaign.value`, `Package.withdrawalFeeDiscount`,
  `ReferralLevel.commissionValue`, `CourseCoupon.value`) + all non-money floats (multipliers, ratings, score,
  `dailyReferralPoints`).
- **New `src/lib/money.ts`** (re-exports `Prisma.Decimal`; `D`/`toNum`/`toNumOrNull`/`add`/`sub`/`mul`/`div`/
  `gte`/`gt`/`lte`/`lt`/`eq`/`sum`/`round2`). Server-side money math on the hot mutation paths
  (auction settlement, checkout, withdrawals, commissions, subscription renewal) now uses exact Decimal;
  the P0 atomic-CAS balance guards are unchanged (Prisma coerces number↔Decimal on writes/filters).
- **Contract preserved as `number`:** every API JSON response serializes Decimal→number at the boundary
  (`toNum`/`toNumOrNull`), so no client component or `src/types` changed. tsc surfaced every broken
  arithmetic/comparison site (~80 across ~50 files); a dedicated JSON-boundary + cast-mask audit caught the
  tsc-blind leaks — including masked-Decimal landmines in `cart/checkout`, `admin/leaderboard/reset` (prize
  scoring), and the `PackageRow` DTO (`getEffectivePackage`/`defaultPackage` now normalize money via `toNum`).
- Verified: `tsc --noEmit` clean, eslint clean, `next build` compiles.

**Deferred beyond P3:** unique-reference idempotency (needs reference normalization + composite key), splitting
the 2.7k/2.9k-line client files, remaining raw admin-table → `AdminTable` migration, full `next/image` sweep,
`db push` → real Prisma migration history.

---

## ✅ P4 Remediation — July 25, 2026 (real Prisma migration history — DONE, verified)

- Every schema change P0–P3 was applied with `db push` (no versioned history). **Baselined** the existing
  Prisma Postgres DB into a real migration history: `prisma migrate diff --from-empty --to-schema` →
  `prisma/migrations/0_init/migration.sql` (full DDL incl. the P3 `Decimal(18,6)` columns, `ReferralSourceType`
  enum, `Transaction @@index([reference])`), marked already-applied with `migrate resolve --applied 0_init`
  (non-destructive — writes only `_prisma_migrations`). Added `prisma/migrations/migration_lock.toml`.
- **Zero drift verified:** `migrate status` → "Database schema is up to date!" (1 migration);
  `migrate diff --from-schema … --to-config-datasource --exit-code` → "No difference detected" (exit 0).
- **Workflow adopted:** new scripts `db:migrate` (`migrate dev`), `db:migrate:deploy` (`migrate deploy`),
  `db:migrate:status`; `db:push` kept but documented as dev-scratch only. Full workflow in `MIGRATIONS.md`
  (schema edit → `db:migrate --name …` → review SQL → commit `prisma/migrations/**` → release runs
  `db:migrate:deploy`; not wired into `next build` by design).
- Regression guard: `prisma generate` + `tsc` + `next build` all green (schema unchanged — no-op confirming
  nothing broke).

---

## ✅ P5 Remediation — July 26, 2026 (reference-based transaction idempotency — DONE, verified)

- **DB backstop:** `Transaction @@unique([userId, reference])` (migration `*_txn_reference_idempotency`, applied
  via the P4 workflow; migrate status up-to-date, no drift). A deterministic `reference` for a once-only money
  event is now an idempotency key — a retry / concurrent-double / replay reusing it fails the 2nd ledger write
  with P2002. Scoped to userId (double-entry rows share a reference but differ by userId); NULL refs stay
  unconstrained. Verified zero existing dup `(userId, reference)` rows before adding it; guarded the only gap
  (tutor self-enrol in `courses/[id]/enroll`, which shares a reference across buyer/tutor rows).
- **Helper:** `src/lib/idempotency.ts` `isDuplicateLedgerError(err)` — duck-typed P2002 narrowed to the
  `reference` column (won't swallow unrelated unique violations). Applied graceful handling (return
  already-processed, no double-settle/500) to the deterministic once-only mutations: marketplace
  checkout/orders, close-auction, offer-accept, course enroll, admin course-refund, admin dispute-refund,
  gateway deposit callback — the primary fix for the close-auction / offer-accept / deposit-callback
  check-then-act races.
- **Reference normalization** (once-only paths that used `Date.now()`/null → deterministic, so the constraint
  covers them): daily-reward `daily_<dayKey>`, solo-reward `solo_<day>`, welcome bonus `welcome_<userId>`,
  quiz reward `quiz_reward_<userId>_<quizId>` (kills the quiz double-credit race — reward is once-per-quiz),
  admin bulk-adjust `admin_adjust_<uid>_<ts>` (was batch-size, collision-prone under the new constraint).
- **Guard-gap fixes:** `feed/donate` and `packages/purchase` converted to atomic CAS debits
  (`updateMany … balance gte`) so concurrent double-submit can't overspend; packages/purchase also writes a
  `subscription_<id>` reference and rejects a stacked pending off-platform request.
- Verified: tsc + eslint clean, next build compiles.

---

## ✅ P6 Remediation — July 26, 2026 (next/image migration — DONE, verified)

- **Config + latent-bug fix:** `next.config.ts` now has `images.remotePatterns` for our own hosts only
  (`**.amazonaws.com`, `**.cloudfront.net`, `**.googleusercontent.com`) + avif/webp. The 7 pre-existing course
  `<Image>` uses had NO image config → they would throw "hostname not configured" on external thumbnails; now
  fixed.
- **`SmartImage` wrapper** (`src/components/user/primitives/smart-image.tsx`): wraps `next/image` and sets
  `unoptimized` when the src host isn't in our allowlist (or is `data:`/`blob:`), so arbitrary user/admin-typed
  image URLs (ad creatives, marketplace/course/game thumbnails, pasted avatars) still render browser-direct
  with lazy-load + CLS reservation and never throw — while our-host images get real optimization. Deliberately
  avoids a global `hostname:"**"` (which would make `/_next/image` an open fetch proxy).
- **Migrated ~50 `<img>` → SmartImage** across ~40 files: 28 large/fill-able images (marketplace cards/covers/
  detail/cart/orders, feed multi-image grids, watch-ads card, profile/group covers, splash, quiz option, games,
  task thumbnails) + 22 avatars (feed/chat/marketplace/profile/courses/groups).
- **Left as `<img>` (documented):** QR/data-URIs, blob upload previews, free-zoom/unknown-aspect
  (`object-contain`) images incl. single-image feed/profile posts, tiny static local icons, KYC, and the
  low-traffic admin/tutor tables (deferred).
- Verified: tsc + eslint clean, next build compiles (no remotePatterns/`<Image>`-validation errors).

---

## ✅ P8 Remediation — July 27, 2026 (finish deferred admin tables — DONE, verified)

- Migrated the last deferred admin lists to `AdminTable` (mobile card-reflow): **coupons** (lifted per-row
  busy → parent `busyId`, actions column), **course-categories** (inline colSpan edit-expand refactored to open
  the edit form in the top panel, matching the create flow — AdminTable can't express a colSpan expand),
  **packages "plans"** table (`mobileHidden` on Slug/Access/Features), and the **4 user-detail sub-tables**
  (transactions / task-submissions / referrals / withdrawals, rendered `bare` inside the existing tab card).
- Remaining raw `<table>` are now only the intentionally-special ones: access permission-matrix (dynamic role
  columns), leaderboard cycle-winners (expandable rows), proxy-monitor (live sessions), users-table-client
  (selection + bulk), boost-followers sample preview — plus the AdminTable/Shell components themselves.
- Verified: tsc + eslint clean, next build compiles.

---

## ✅ P7 Remediation — July 26, 2026 (admin consistency polish — DONE, verified)

- **Admin/tutor images:** migrated 37 admin/tutor `<img>` → `SmartImage` (lazy-load, CLS, optimization for
  our-host images; `unoptimized` fallback for arbitrary URLs). Avatars/thumbnails use fixed `width`/`height`;
  covers/media-grid/aspect boxes use `fill` (added `relative` where missing); `onError` handlers preserved;
  TaskForm previews use fixed w/h (content-sized `relative inline-block` parent would collapse under `fill`).
  Kept as `<img>`: free-zoom/unknown-aspect previews (zoom lightbox, single proof/category previews, user-detail
  post image).
- **Raw `<table>` → `AdminTable`** (mobile card-reflow consistency): tutor course-students, admin proxy, admin
  missions, admin packages "recent subscriptions", and the three admin marketplace tables (listings / orders /
  disputes). Row-action components and server-pagination/filter JSX kept intact; identity column marked
  `primary` for the mobile card title.
- **Deleted dead code:** `src/components/admin/offerwalls/offerwall-callbacks-client.tsx` (zero importers).
- **Intentionally left raw** (documented): access permission matrix (dynamic role columns), coupons/categories
  (per-row edit-state components — deferred), packages plans table (wide 9-col), the 4 user-detail sub-tables,
  leaderboard cycle-winners (expandable rows), proxy-monitor live sessions, users-table (selection + bulk).
- Verified: tsc + eslint clean, next build compiles.

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
