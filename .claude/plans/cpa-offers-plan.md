# CPA offers — separate module (2026-09-29)

Owner's decision: CPA is its OWN feature, not part of Offerwall. Offerwall tables and pages are not touched.
It reuses shared helpers only: task audience targeting (`src/lib/task-targeting.ts`), the points ledger, fraud signals and `writeAudit()`.

## Flow
1. Admin creates a CPA offer:
   - Details: logo, title, network, category, description, steps, points, network payout ($).
   - Tracking link with macros: `{username} {userId} {clickId} {country}`.
   - Limits: daily cap, total conversions cap, one per user.
   - Targeting: country / division / district / upazila / gender / age.
   - Completion mode: PROOF (default, admin approves) or POSTBACK. A hold-hours setting delays withdrawal.
2. User sees the offers they are eligible for at `/cpa`.
3. Start → `/go/cpa/<offerId>`. A CpaClick is created (the clickId) and the user is redirected to the link with the macros filled in. The raw link is never shown.
4. The user submits proof → PENDING. Admin approves (points credited once, in the ledger) or rejects with a reason.
5. Optional postback `/api/cpa/postback?click=<clickId>&payout=&txid=&sig=`, signed with a secret.
   - It marks the conversion verified, or auto-approves if the offer allows it.
   - It never pays twice (txid unique).
6. Reports for each offer:
   - Figures: clicks, unique users, pending/approved/rejected, conversion %, points paid, network revenue, profit.
   - A click list (user, time, location, clickId, status) with filters and CSV export.

## Loss guards
- No points before approval; points go into the ledger in the same transaction.
- One conversion per user per offer, enforced by a unique index.
- The caps are claimed with a conditional update.
- A warning shows when points exceed the network payout.
- Postbacks are signed and deduplicated by txid.

## Phases
A. Schema, migration, lib, APIs.
B. Admin UI.
C. User UI.
D. Verification.
