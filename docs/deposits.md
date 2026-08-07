# Deposits — manual / Binance payment

While the online gateways are unconfigured, users add money manually. Everything
routes through **wallet deposit → buy from wallet**, so one flow funds ad credit,
subscriptions, marketplace, etc.

## Admin: set up deposit methods
Admin → **Payment Methods → Deposit methods (where users send money)**:
- Add / edit methods — presets for **Binance Pay, bKash, Nagad, Rocket, PayPal,
  Payoneer**, plus **Add method** for any custom digital wallet.
- For each: a **receiving account/address** (Binance UID, bKash number, PayPal
  email, wallet address…), an **account label** (what the account is), an optional
  **QR code image** (users scan to pay), an optional **pay link**, **instructions**,
  **min/max**, and an **Active** toggle.
- A method only appears to users when it's **Active and has a receiving account**.
- Stored in the `deposit_methods` SystemSetting (no migration).

## User: add funds
`/deposit` is the single funding form (reached from the wallet **Add funds** button,
the **ad-credit "Add funds"** button, or subscription checkout):
1. Pick a method → sees the **receiving account + copy button**, the **QR code**,
   an **Open payment link** button, instructions, and the amount limits.
2. Pays off-platform, enters the **transaction id** (+ optional screenshot proof).
3. Submits → a **PENDING** `Deposit`.

## Admin: approve + report
Admin → **Deposits** (guarded by `withdrawals.view`): a report filterable by
**status / method / search**, each row showing the user, amount, method, txn id,
date, reviewer, and a **zoomable payment proof**. Verify → **Approve** → the user's
`cashBalance` is credited (a `DEPOSIT` transaction + notification). Reject stores a
note. `Deposit.txnId` is unique, so the same payment can't be credited twice.
**Export CSV** downloads the (filtered) deposits, ready to open in Excel.

## Then buy anything
Wallet cash funds everything already: **ad credit** (`buyAdCredits`, cash/points),
**subscriptions** (`/api/packages/purchase`, CASH/POINTS), marketplace, etc.

## Notes / limits
- **Manual = admin-verified**: there's no automatic confirmation; an admin approves
  before the wallet is credited. When the real gateways are wired, their online
  buttons already live on the same `/deposit` page.
- Amounts are USD. Fees/instructions are per method, admin-set.
