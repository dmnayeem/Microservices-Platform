# Deposits — manual / Binance payment

While the online gateways are unconfigured, users add money manually. Everything
routes through **wallet deposit → buy from wallet**, so one flow funds ad credit,
subscriptions, marketplace, etc.

## Admin: set up deposit methods
Admin → **Payment Methods → Deposit methods (where users send money)**:
- Add / edit methods — presets for **Binance Pay, bKash, Nagad, Rocket, PayPal,
  Payoneer**, plus **Add method** for any custom digital wallet.
- For each: a **receiving account/address** (Binance UID, bKash number, PayPal
  email, wallet address…), **instructions**, **min/max**, and an **Active** toggle.
- A method only appears to users when it's **Active and has a receiving account**.
- Stored in the `deposit_methods` SystemSetting (no migration).

## User: add funds
`/deposit` (reached from the wallet **Add funds** button, the ad-credit "Add funds"
sheet, or the subscription checkout):
1. Pick a method → sees the **admin's receiving account + instructions + a copy
   button** and the amount limits.
2. Pays off-platform, enters the **transaction id** (+ optional screenshot proof).
3. Submits → a **PENDING** `Deposit`.

## Admin: approve
Admin → **Deposits**: verify the proof/txn id → **Approve** → the user's
`cashBalance` is credited (a `DEPOSIT` transaction + notification). Reject stores a
note. `Deposit.txnId` is unique, so the same payment can't be credited twice.

## Then buy anything
Wallet cash funds everything already: **ad credit** (`buyAdCredits`, cash/points),
**subscriptions** (`/api/packages/purchase`, CASH/POINTS), marketplace, etc.

## Notes / limits
- **Manual = admin-verified**: there's no automatic confirmation; an admin approves
  before the wallet is credited. When the real gateways are wired, their online
  buttons already live on the same `/deposit` page.
- Amounts are USD. Fees/instructions are per method, admin-set.
