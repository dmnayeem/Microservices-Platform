# Deferred Work — এক জায়গায় (add one-by-one later)

> এখানে যা যা এখন **করা হচ্ছে না / বাদ রাখা হয়েছে** তা টিকে থাকে। ইউজার একটা বেছে বললে সেটা তখন implement করা হবে। কাজ শেষ হলে সেই লাইন এখান থেকে সরানো হবে।

---

## ⏸️ EI KAJ PORE KORBO (2026-07-30) — "note rakhun" (blocked on external creds/infra, faked na)
আমি একা শেষ করতে পারিনি কারণ external account/service/key দরকার। creds/decision দিলে যেকোনোটা তখন করা যাবে।
- [ ] **Payment gateways** — Stripe / SSLCommerz / bKash / Nagad / PayPal keys। Course enroll (`/api/courses/[id]/enroll`) + marketplace checkout এখন **wallet-only**; `paymentMethod` enum + TODO hook আগে থেকেই আছে — শুধু SDK + keys wire করতে হবে।
- [ ] **Email / Push notifications** — provider + keys (Resend/SendGrid + FCM/OneSignal)। Notification model আছে, শুধু delivery channel নেই।
- [ ] **HLS / live video** — transcoding service + infra (ffmpeg/Mux/Cloudflare Stream)। Video protection এখন signed-URL deterrence পর্যন্ত (DRM na)। Live class model (`CourseLiveClass`) আছে কিন্তু real streaming নেই।
- [ ] **Anti-fraud Phase C** — Telegram/Discord bot **token** বসানো + bot-কে channel-এ add + প্রতি task-এ verify target set। কোড dormant, শুধু token লাগবে (`src/lib/social-verify-membership.ts`)।
- [ ] **i18n** — কোন কোন ভাষা target সেটা ঠিক করা দরকার + বড় কাজ (whole-app string extraction)।
- [ ] **Cursor pagination retrofit** (deferred, risky না blocked) — feed/notifications/admin-এর offset→cursor। Live pagination contract বদলায় → আলাদা careful pass + regression test দরকার। Log **retention pruning** (নিরাপদ অংশ) `src/lib/log-retention.ts` + daily cron-এ করা হয়ে গেছে।

**NOTE:** affiliate + promotion + video protection + digital marketplace + PDF certs + log-retention + admin-table cleanup সব **DONE + committed + pushed (through 18d93ec), migrations applied**। HTML5 Games আগেই পুরো বানানো ছিল।

---

## Social anti-fraud proof (follow-on to #10) — Phases A/B/C ALL DONE (uncommitted). All 4 migrations APPLIED to live DB 2026-07-29.
Plan: `.claude/plans/start-next-abstract-lampson.md`. User wants all 4 methods.
- [x] **Phase A** ✅ DONE (uncommitted) — unique-code + server URL-fetch auto-verify. `src/lib/task-verify-code.ts` (derived HMAC per-user code), `fetchRawHtml` in link-preview.ts, `BundleItem.verify="CODE"`, admin "Auto-verify by code" toggle, run-view code box, submit-route fetch+match → auto-approve (verifyStatus in metadata), admin panel badges. Typecheck+eslint clean.
- [x] **Phase B** ✅ DONE (uncommitted) — `User.trustScore`+`fraudStrikes` (migration 20260729184245_user_trust_score), `src/lib/trust.ts` bumpTrust (approve +1 / reject −10+strike, wired into submit auto-approve + admin approve/reject), spot-check% + min-trust gate on auto-approve (→ heldForReview), `antifraud.block_duplicate_proof` hard-block (400 DUPLICATE_PROOF), screenshot **byte-hash** dedup (sha256 of image bytes via new `fetchRawBytes`, kind SCREENSHOT_BYTES — catches re-upload under new URL; TRUE perceptual-hash for re-encode/crop = documented FOLLOW-UP, skipped to avoid native `sharp` dep). Admin settings limits-tab: min_trust, spot_check_percent, block_duplicate_proof. Typecheck+eslint clean.
  - [ ] **FOLLOW-UP**: true perceptual/Hamming screenshot hash (needs image lib — jimp pure-JS or sharp native) for re-encoded/cropped duplicates.
- [x] **Phase C** ✅ DONE (uncommitted) — Telegram/Discord bot membership verify. `LinkedPlatformAccount` model (migration 20260729185901). Routes: `/api/integrations/telegram/callback` (Login Widget hash verify), `/api/integrations/discord/start`+`/callback` (OAuth identify, signed state via new `oauth-state.ts`), `/api/integrations/config`. Helper `social-verify-membership.ts` (getChatMember + guild-member → verified/failed/unverifiable). Submit verify loop generalized to CODE + TELEGRAM_MEMBER + DISCORD_MEMBER (needsLink when unlinked). Admin builder membership toggle + verifyTarget field on JOIN actions. Integrations settings: telegram/discord token fields. Profile `VerifiedAccountsCard` (Telegram widget + Discord link) + run-view link hint. DORMANT until admin sets tokens + adds bot to channels + sets each task's verify target. Typecheck+eslint clean.

## #12c Remaining-screens UI declutter — DONE (uncommitted) 2026-07-29
Audit: "My Team" = no separate screen (Referrals section, clean). Phase A: emoji headers→lucide (manual-tasks 📋, chat-inbox 💬, course-creator 📚), advertiser text-[9px]→[10px]. Phase B: Marketplace search-row `flex`→`flex-wrap`+min-w (fixes the worst cramped row). Phase C: advertiser campaign-detail + dashboard raw cards→`.card`, ad-row badges→`flex-wrap` (un-stack). Phase D (MAIN LMS screens): CourseLanding 6 sections→`.card`, CoursesBrowse filter card→`.card`, my-learning cards→`.card`, tutor/dashboard `-slate-`→`-gray-` palette unify. Typecheck+eslint clean.
- [x] **LMS deep migration DONE** (uncommitted) — all course cards→`.card` (CourseLanding subs Hero/Curriculum/Reviews/QA/EnrollCta/Related, player/ Shell/Sidebar/Pane/Quiz/Assignment, CoursesBrowse CourseCard, my-learning enrollment/wishlist/EmptyCard, course-creator form/module), CoursesBrowse loader→CardSkeleton + empty→EmptyState, PlayerShell empty→EmptyState, QuizPlayer loading→CardSkeleton, course-creator text-[11px]→xs. Typecheck+eslint clean.
  - [ ] **Still deferred (behavior-safe / cosmetic-only):** local Stat/Fact→shared StatCard (already render `.card`); tab-bars/segmented-chips→FilterChips (my-learning tabs are URL Links → routing risk); small inline `<p italic>` panel empties (LessonPane/Notes/Bookmarks/Reviews/QA — too small for EmptyState card); AssignmentSubmitter shared error+loading box; Marketplace filter BottomSheet consolidation; Lottery/KYC emoji-in-body; orphaned dead `courses/course-player.tsx`.

## #12b Multi-screen UI declutter — DONE (uncommitted) 2026-07-29
Shared `TaskSubmissionRow` primitive added. Phase 1: Notifications (glass card + FilterChips + EmptyState/ListSkeleton, kept bulk-select/delete), Earn hub (rainbow gradient→cohesive tinted chips, 9px→10px). Phase 2: quiz/social/proxy/board headers emoji→lucide+text-2xl, social 9px→10px, board micro-stat 10px→11px, TaskSubmissionRow adopted in article+video. Phase 3: Withdrawal→BalanceCard(compact)+lucide header, Packages tier cards→glass, Marketplace header emoji→lucide. Phase 4: mobile-earn grid 4-up→2-up sm:4-up, groups-tab→EmptyState/ListSkeleton+10px badges, composer 10px→11px. Typecheck+eslint clean all phases. Guardrail honored: styling-only, no behavior change.
- [ ] **FOLLOW-UPs (deferred, low priority):** Marketplace 4-row filter cluster → mobile BottomSheet; composer progressive-disclosure ("+options"); earn-hub deep per-tab card normalization (mega-file); tier-data triplication dedup (withdrawal/packages/my-package); NotificationItem primitive adoption (needs it to support checkbox/delete first).

## #7 Sequential Task Unlock (feature shipped 2026-07-29) — বাদ রাখা অংশ

- [ ] **D7.1 — Per-type task page-গুলোতে LOCKED badge**
  Dedicated pages (`/video-tasks`, `/article-tasks`, `/quiz-tasks`, `/social-tasks`, `/manual-tasks`, `/proxy-tasks`, `/board-tasks`)-এ locked task-এ 🔒 badge দেখানো হয়নি।
  *এখন কী হয়:* server gate (`start` + `quiz` route) locked task start করতে দেয় না — তাই নিরাপদ, শুধু ঐ পেজে ভিজ্যুয়ালি lock দেখায় না।
  *করতে হলে:* প্রতিটা view যেখানে `/api/tasks` থেকে `TaskCard` render হয়, সেখানে `t.locked ? status="LOCKED"` pattern (hub-view-এর মতো) বসাতে হবে।

- [ ] **D7.2 — TASK_LOCKED-এর জন্য আলাদা client notice**
  এখন locked task-এ সরাসরি গেলে generic error message দেখায় (`code:"TASK_LOCKED"`)। `UPGRADE_REQUIRED`-এর মতো একটা সুন্দর dedicated notice/টোস্ট বানানো যেতে পারে।

- [ ] **D7.3 — Admin-এ task order drag-to-reorder UI**
  এখন শুধু number input ("Sequence Order")। ভবিষ্যতে drag-and-drop list দিয়ে reorder করা যেতে পারে।

- [ ] **D7.4 — বড় স্কেলে chain query optimization**
  এখন full ordered eligible task-set (id-only) walk হয় (short cache সহ)। active-task সংখ্যা বিশাল হলে cutoff-order ভিত্তিক optimization লাগতে পারে।

**⚠️ Action item (deferred নয়, করা দরকার):** migration `20260729164834_task_order` এখনো DB-তে apply হয়নি → `npx prisma migrate deploy` চালাতে হবে।

---

## অন্যান্য পরিচিত deferrals (আগের কাজ থেকে)

- [ ] **DB scale (#4) deferred, correctness-sensitive:** cursor pagination, exact-count drop, unbounded downline/following findMany, broadcast/export streaming, append-only log-এর retention/pruning (SocialActionLog/AdView/PostView/Notification/AuditLog)।
- [ ] **~9 low-traffic admin table** এখনো plain scroll-এ (shared AdminTable/card-reflow-এ আসেনি)।
- [ ] **Ad system roadmap:** HTML5 Games catalog (৫-feature roadmap-এর শেষ বাকি item)।
- [ ] **Courses LMS** deferred integrations: payment gateways, email/push, PDF certs, HLS/live video, i18n/referrals।

---

## বাকি 13-point items (#8–#13) — পরের plan-mode লাগবে

- [x] **#8** ✅ DONE (uncommitted) — per-user permission/access সব user-edit পেজে; gap-fill (plan expiry, 2FA disable, tutor-suspend) + admin-role SUPER_ADMIN guard শক্ত + `/admin/access` role-editor সরানো + edit পেজে action bar।
- [x] **#9** ✅ DONE (uncommitted) — per-session reshuffle (seed), live "New posts" pill via `/api/feed/pulse` (max lastActivityAt poll, 30s), own-comment instant bubble।
- [x] **#10** ✅ DONE (uncommitted) — social watch server anti-fraud (heartbeat+submit gate), +6 platforms (WhatsApp/Twitch/Kick/Bluesky/Mastodon/Medium), proof-fraud fingerprint dedup + admin badge, cleanups। Migration 20260729181251_social_proof_fingerprint (not applied)।
- [x] **#11** ✅ DONE (uncommitted) — VIDEO task-এর মধ্যেই YouTube engagement (subscribe/like/comment) — VideoConfig.engagement, builder section, player checklist, submit metadata + screenshot→manual auto-approve adjust, VideoProofPanel badges, detail requirements। No schema। Watch/uniqueKey/watch-only unchanged। Honor→auto-approve (trust-guarded), screenshot→manual।
- [x] **#12** ✅ DONE (uncommitted) — Dashboard declutter (no screenshot; code-level clutter fixed). page.tsx rewritten: 8→5 bands, shared primitives (BalanceCard hero + StatCard strip folding old right-rail + TransactionRow real recent-activity + EmptyState), 1 nudge not 2, compact quick-access chips (mobile fix), local StatsCard/QuickActionCard removed. No schema/API. NOTE: no visual verify done — offer `/run` or user screenshot to refine.
- [ ] **#13** `/leaderboard` mobile UI/UX ঠিক করা।
