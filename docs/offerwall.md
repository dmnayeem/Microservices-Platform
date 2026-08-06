# Offerwall & surveys

Two layers, one polished page:

1. **Curated catalog** — categories → offers you (admin) create or sync from a
   provider, completed one-by-one with sequential unlock, country-targeted, per
   offer points, and an instruction → **Start Work** → offer flow.
2. **Provider walls** — third-party offerwall/survey sites embedded as a hosted
   wall (iframe) and/or pulled in as native offer cards via their API. Crediting
   is always via the secure S2S **postback**.

## Admin — `/admin/offerwalls`

Three tabs:

- **Providers** — register a network (AdGate, OfferToro, CPX, BitLabs, …). Set:
  - **Integration**: *Embedded wall (iframe)* or *API catalog (native cards)*.
  - **Kind**: Offers or Surveys.
  - **API key / Secret** (the postback secret), **Postback URL** (auto:
    `/api/offerwall/<PROVIDER>/callback`), **Reward multiplier**, **hold hours**,
    **auto-credit**, **test mode**, **iframe URL** (with `{userId}` and, for CPX
    surveys, `{secureHash}` = md5(userId+secret), injected server-side).
  - For API providers, **Sync offers** pulls their catalog into the Offers tab.
- **Categories** — the tabs users see (Games, Finance, Sign-ups, Surveys…):
  name, emoji, color, order, active.
- **Offers** — the catalog. Per offer: title/image/description, **instruction
  steps**, **points** (+ optional USD payout), **country picker** (empty = all),
  **order** (sequential unlock within the category), **completion mode**
  (Proof / Postback / Manual), **tracking URL** (`{userId}`/`{clickId}`
  placeholders), provider link, hold hours, one-time, featured. An in-UI **guide
  panel** explains every field.

Completions & chargebacks are reviewed at **Completions & Callbacks**.

## User — `/offerwalls`

Category tabs + Featured walls + Surveys + History. Tapping an offer opens the
**instruction page**; **Start Work** records a click, opens the offer, then (by
mode) shows a screenshot upload (Proof), an auto-credit note (Postback), or a
manual-review note. Offers unlock **one-by-one** in each category, and only show
to users whose profile country matches the offer's country list.

## How crediting works (the postback)

- The offer's tracking URL carries `{userId}` and `{clickId}` (subid). The
  provider echoes them back to `/api/offerwall/<provider>/callback`.
- The callback verifies an **HMAC-SHA256** over
  `transactionId+userId+userPayout+payoutAmount` keyed by the provider secret,
  then resolves the **clickId → OfferwallClick → OfferwallOffer → completion**
  and credits it (points × reward multiplier). USD payout is the source of truth
  for the ledger; `getPointsPerUsd()` normalizes provider points across networks.
- **Dedup**: `transactionId` is unique (retries are ignored).
- **Holds**: `holdHours > 0` keeps the completion PENDING with `heldUntil`;
  `POST /api/admin/offerwall/release-holds` (admin or a scheduled call) credits
  the elapsed ones. Surveys should use a hold to absorb reconciliations.
- **Reversals / chargebacks**: a postback with `state=rejected|chargeback` or a
  negative amount posts a compensating **negative Transaction**, decrements the
  balance, and flips the completion to REVERSED. Nothing is hard-deleted.
- Verification/proof offers (no provider) go PENDING → an admin approves them.

## Adding a provider adapter

`src/lib/offerwall-providers/` — implement the `OfferAdapter` interface
(`fetchOffers(creds) → NormalizedOffer[]`) and register it in `index.ts`.
AdGate has a dedicated adapter; everything else uses the generic JSON-catalog
adapter (point the provider's `apiEndpoint` at its get-offers URL).

## Credentials note

Live crediting (API sync, real postbacks, survey walls) needs each provider's
**API key + postback secret** in the Providers tab. The tracking-URL, subid
matching, HMAC verification, holds, and reversal ledger are all built; end-to-end
verification with a real network is only possible once those credentials exist.
Everything that doesn't need a provider — categories, manual/proof offers,
sequential unlock, country targeting, the user flow, manual credit — works today.
