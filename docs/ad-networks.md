# Ad Manager — networks & local ads

The Ad Manager serves **local (house)** ads and **third-party network** ads
(Google AdSense, Google Ad Manager, or any network's snippet) across every
surface (banner spaces, the reward interstitial, and Watch-&-Earn). Network ad
HTML runs in a sandboxed iframe so its `<script>` actually executes.

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
  full `/network/unit` path. Set the **Size** below (defaults to 300×250).
- **Other network** → paste the raw `<script>…</script>` snippet from any network.

Then pick a **placement** (any banner space, or `REWARD_INTERSTITIAL`), set
**status = ACTIVE**, and (for banners) a **Size**. Network ads don't need an ad
budget — they serve as house inventory.

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

## Reporting & limits (important)
- **Local ads** — full impressions / clicks / CTR / spend in **Ads → Analytics**.
- **Network ads (AdSense / GAM)** — the platform counts **served impressions**
  only. The third-party creative renders inside an opaque iframe, so **clicks and
  revenue are reported in the network's own console** (AdSense / Ad Manager), not
  here. Network rows in the report show impressions + a "network" marker.
- **Ad-blockers** — AdSense/GAM scripts load third-party from Google and are
  **blockable**; only local/house ads are blocker-resistant.
