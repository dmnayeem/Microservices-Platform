# Ad Manager — networks & local ads

The Ad Manager serves **local (house)** ads and **third-party network** ads
(Google AdSense, Google Ad Manager, or any network's snippet).

**AdSense and Ad Manager ads are real in-page slots**, not iframes. The Google
tag loads **once per page** from the root layout, and only when a publisher id
has been saved — with nothing configured, no Google script and no Google
reference reaches the page at all. A raw `<script>` snippet from any other
network still runs in a sandboxed iframe, which is correct for that case.

**Google ads are barred from incentivised surfaces in code.** The reward
interstitial, Browse & Earn and Watch & Earn pay the user for being there, which
AdSense's incentivised-traffic policy prohibits. Those spaces take own /
direct-sold (`LOCAL`) and `HTML` creatives only, and the API rejects anything
else — it is not left to be remembered.

## One-time setup (publisher config)
Admin → **Ads → Ad Spaces → Ad networks (publisher)**:
- **AdSense client** — your `ca-pub-…` id (from AdSense → Account).
- **Ad Manager network code** — your GAM network code (e.g. `22106938064`).

Set once; per-ad you only enter the slot / ad-unit.

## Create an ad (Ads → New Ad → Creative = "Ad Network")
- **Google AdSense** → paste the **ad slot id** (`data-ad-slot`, e.g. `1234567890`).
  Optionally override the client per ad; otherwise the global `ca-pub` is used.
- **Google Ad Manager** → the **ad-unit path**. A bare name (`my_banner`) is
  prefixed with the global network code → `/22106938064/my_banner`; or paste a
  full `/network/unit` path. The slot size comes from the ad's **Size**, falling
  back to the space's own size — not a fixed 300×250.
- **Other network** → paste the raw `<script>…</script>` snippet from any network.

Then pick a **placement** — any banner space. **Not** `REWARD_INTERSTITIAL`,
`VIDEO_INTERSTITIAL`, `GAME_INTERSTITIAL`, `EARN_BROWSE` or `REWARDED_VIDEO`:
those are incentivised and the API will reject a network ad on them. Set
**status = ACTIVE** and a **Size** the space accepts (each space declares its own
allow-list and a max height, both enforced on write and at render). Network ads
don't need an ad budget — they serve as house inventory.

**Unsold slots fall back to your own inventory.** When AdSense marks a unit
`unfilled`, or Ad Manager renders empty, the slot re-requests from the ad server
excluding network types and shows a house or direct-sold creative instead. While
AdSense approval is pending, this is what makes the network spaces earn anything.

## Tracking pixels (optional, any ad type)
- **Impression pixel URL** — fired as a 1×1 beacon when the ad renders.
- **Click-tracker URL** — pinged when a **local** creative is clicked.

## Ad spaces, previews & feed density
Admin → **Ads → Ad Spaces**:
- Each space card shows a **live preview** of a real served creative at that
  space's **recommended size** (previews never count impressions), or a
  size-shaped skeleton when no ad is active. Creating an ad pre-fills that size.
- **Rotation** — put 2+ ACTIVE ads on one space and it **auto-rotates every N
  seconds** (per-space "Rotate every … sec") **and changes on reload**. One ad =
  no rotation.
- **Feed ad density** (in Ad Spaces): native in-feed ad **every N posts**
  (default 2); admin-promoted post **every N entries** (default 4); an optional
  **banner under posts** (`FEED_POST_BELOW`, default off) every N posts.
- Slots **reserve their size while loading** (no blank jump) and **collapse** when
  there's genuinely no ad.

## Local (house) ads
Image / GIF / video / native / raw HTML. Fully first-party and
**ad-blocker-resistant** (creatives are proxied same-origin), with **full
reporting** in-app: impressions, clicks, CTR, spend — see **Ads → Analytics**
(7/14/30/90-day range, with per-ad / per-placement / per-campaign tables).

## Scheduling & targeting
- **Dates** live on the **campaign** (optional start/end). No date = always
  serves; dated = serves only within `[start, end]` (UTC).
- **Targeting** (per ad) — country/city/gender/age/level/package/language/KYC/
  tags/etc. Empty = everyone.
- **Budget** (campaign) — CPC billing with atomic no-overspend; a drained
  campaign auto-pauses. (Network ads ignore budget — they're house inventory.)

## Consent, ads.txt, and auto ads

- **Consent** — the cookie banner's *marketing* preference is now read. Without
  it, both AdSense and Ad Manager are asked for **non-personalised** ads. Note
  this is *not* a Google-certified CMP: for visitors in the EEA, UK and
  Switzerland Google requires a certified TCF v2.2 platform and stops serving
  without one. Enable **Load Google's consent message** in Monetization after
  creating the message in your AdSense console — that is the certified one.
- **`ads.txt`** — served at `/ads.txt`, editable in Monetization. Leave it empty
  and the AdSense line is written from your publisher id. Most programmatic
  demand refuses to bid without it. It returns **404** while nothing is
  configured, deliberately: an *empty* ads.txt declares that nobody may sell your
  inventory, which is worse than having no file.
- **Auto ads** — off by default, and when on they run on the **public marketing
  pages only**. Read the warning on that toggle: switching it off here does not
  keep auto ads off the app. They run wherever the AdSense script loads, and it
  must load in the app for your normal units to fill. The only real control is a
  **URL exclusion in your AdSense console** covering every logged-in page — and
  those pages are incentivised, where Google ads are not allowed.

## Reporting & limits (important)
- **Local ads** — full impressions / clicks / CTR / spend in **Ads → Analytics**,
  plus **eCPM** and **fill rate** per space, and a revenue summary on
  **Monetization**.
- **eCPM** is revenue per 1,000 *paid* impressions. A space filled entirely with
  your own house ads shows "house": it earns nothing by design, so dividing by
  its impressions would only make a working space look broken.
- **Fill rate** is how often a request for a space actually produced an ad. A low
  figure means the space asks more often than there is inventory to answer —
  widen its interval or add creatives. A dash means it has not been measured yet.
- **Network ads (AdSense / GAM)** — the platform counts **served impressions**
  only. **Clicks and revenue are reported in the network's own console** and this
  database will never see them. Network rows show impressions + a "network" marker.
- **Ad-blockers** — AdSense/GAM scripts load third-party from Google and are
  **blockable**; only local/house ads are blocker-resistant.

## Pricing — the rate card

Each space carries its own price under **Ads → Ad Spaces**:

- **Per click ($)** — what an advertiser is billed for a click there. Leave it
  blank and the space uses the global rate (Monetization → click price). Until
  this existed there was exactly one price for every space, so a click on the
  withdrawal page cost the same as one on a banner nobody reads.
- **Per month ($)** — the flat price to rent the space outright. Setting it makes
  the space bookable.

**Bookings** (Ads → Bookings) sell a space for a period. While an *exclusive*
booking is active, only that campaign's ads run there — unless it has nothing
servable, in which case the space falls back to your house ads rather than going
blank. A booking does nothing until it is marked paid, so an unpaid agreement
cannot hold a space.

Leave **"bill each click"** off for a flat-rate sponsor: they have paid for the
period, and charging per click on top charges them twice for the same inventory.

Changing a rate never rewrites history — spend is snapshotted at the price in
force when the click happened.
