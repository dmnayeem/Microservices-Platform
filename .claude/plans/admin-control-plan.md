# Admin control + loss-proofing plan (2026-09-29)

Guiding rules for every change:
- Never a path where the platform pays out more than it took in.
- Settings keep their existing keys and values. Moving a setting moves the SCREEN, never the key, so nothing already configured changes.
- One editor per key. A setting lives on its feature's page; the global Settings page only keeps site-wide things and links out.
- Every automatic job gets an Auto/Manual switch for the admin.

## Phase 1 — money correctness
1. Ledger repair for the one user whose 2026-08-11 admin edit was never journalled (ledger-only PENALTY row; the balance is untouched).
2. Ad campaign budget:
   - An admin budget change goes through the ad-credit ledger.
   - Ending a campaign returns only the unspent, funded budget to ad credit. For example: fund $10, spend $7, $3 stays as credit.
   - Repair "hjh" so its $50 has a ledger source.
3. Referral commission: keep the fraction below one point per referrer and pay it once it reaches one point. Exact, never rounded up.
4. Small holes:
   - An ad click only bills if that ad was actually served (signed serve token).
   - Rate limit plus dedup on reports and follows.
   - Hide banned authors' posts from the feed.
   - Course-coupon limit held under a lock.

## Phase 2 — automatic jobs under admin control
- Inngest never ran in production (`/api/inngest` is redirected to /login). Move its 12 sweeps into our own scheduler:
  - lottery draw, monthly referral bonus
  - campaign end + refund, ad review SLA
  - subscription expiry, task expiry
  - auction close, escrow auto-release
  - game sessions, course reminders and live classes
  - log retention
- /admin/scheduler gets a per-job Auto/Manual switch and a "Run now" button.
- Each money-paying job's own page (lottery, referral) shows its switch too.

## Phase 3 — every feature's settings on its own page
One feature at a time, each checked before the next:
- **Referral / My Team**
  - One page with tabs: Commission levels, Bonuses, Milestones, Limits.
  - The hardcoded referral milestones merge into the admin ladder.
- **Milestones, daily reward, solo reward** — currently hardcoded; they get editors under Gamification.
- **Withdrawals** — one Withdrawal settings screen (global limits, fee, KYC rule, methods). Unused per-method fields are either wired in or removed.
- **Ads** — Ad Manager owns CPC, AdSense and GAM (today edited in 2–3 places). Browse & Earn gets its own section.
- **Feed / Social earning** — one Feed settings page.
- **Games** — reward settings get a UI (none exists).
- **Courses** — the refund window becomes editable (nothing writes it today).
- **Marketplace / Courses / Referral settings pages** — added to the sidebar.
- **KYC and Fraud** — settings move onto their own pages.
- **Global Settings** — keeps site, email, security and notifications; each moved setting leaves a link behind.
