# Ad Credits — how advertisers spend

Advertisers run ads from a dedicated **Ad Credit** wallet (`User.adCreditBalance`),
like Google/Meta Ads. Ad credit is **USD-denominated (1 credit = $1)** and
**non-withdrawable** — it can only be spent on ads, never withdrawn as cash.

## How credit is obtained
- **Buy with wallet cash** (1:1) — advertiser dashboard → **Add funds** → cash.
- **Buy with points** — converted at the `points_per_usd` rate (`src/lib/economy.ts`).
- **Admin grant** — Admin → Ads → Ad Spaces → **Grant ad credit** (by email; a
  negative amount deducts).
- Optional **bonus %** on purchases via the `ads.credit_bonus_pct` setting
  (e.g. 5 → buy $100, get $105 credit).

Every movement is journalled in `AdCreditLedger` (PURCHASE / GRANT / CAMPAIGN_FUND
/ REFUND). A cash/points purchase also writes a wallet `Transaction`
(`AD_CREDIT_PURCHASE`).

## How credit is spent
- Creating or topping up a campaign **draws down ad credit** into the campaign
  `budget` (atomic, no-overspend). Insufficient credit → the advertiser is asked
  to add funds.
- **Per-click billing is unchanged** — clicks decrement the campaign `budget` by
  CPC (`ads.cpcUsd`); a drained campaign auto-pauses.
- **Ending or deleting** a campaign returns its **unspent budget to ad credit**
  (a `REFUND` ledger entry) — not to withdrawable cash.

## Notes / limits
- **Real-money top-up** (card / bKash) needs the still-blocked **payment
  gateways**. Until then, credit comes from wallet cash / points or admin grant;
  a gateway recharge drops into the same `buyAdCredits` flow later — no model
  change.
- Admin **house campaigns** can still be granted free `budget` directly (no
  credit needed) for the platform's own ads.
- Ad credit never appears in the withdrawal flow (that only sees `cashBalance`).
