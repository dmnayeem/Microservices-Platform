import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { getActiveBooking, getPlacementClickCost } from "@/lib/ad-rate-card";
import {
  claimInterstitialSlot,
  isFrequencyCapped,
} from "@/lib/ad-frequency";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { getSetting } from "@/lib/system-settings";
import { bufferImpression, bufferServeOutcome } from "@/lib/ad-counters";
import { firstPartyMediaUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
import {
  getNetworkGlobals,
  resolveNetworkSlot,
  type NetworkSlotConfig,
} from "@/lib/ad-network";
import type { FeedAd } from "@/components/user/feed/feed-ad-card";

/** Shaped banner/interstitial ad — identical to the `/api/ads/serve` payload. */
export interface ServedAd {
  id: string;
  type: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  html?: string;
  sponsor?: string;
  size?: string;
  width?: number;
  height?: number;
  impressionPixel?: string;
  clickTracker?: string;
  /** Admin-granted per-ad escape hatch for network creatives (see SandboxedAdFrame). */
  allowSameOrigin?: boolean;
  /** Present only for ADSENSE / GAM — what the client needs to build a real slot. */
  network?: NetworkSlotConfig;
}

export interface ServeResult {
  poolSize: number;
  rotateMs: number;
  interstitialSeconds: number;
  ad: ServedAd | null;
  /** True when this serve already counted the impression, so the client must
   *  NOT also fire a view beacon (that double-counted every interstitial). */
  countedServerSide?: boolean;
}

const EMPTY: ServeResult = {
  poolSize: 0,
  rotateMs: 0,
  interstitialSeconds: 5,
  ad: null,
};

/**
 * Identical to EMPTY on the wire, but tells the wrapper below that no ad was
 * WITHHELD rather than missing — an ad-free plan, or a frequency cap.
 *
 * The distinction is the whole point of fill-rate tracking. Counting a
 * deliberate suppression as a no-fill would make every space look starved for
 * reasons that have nothing to do with inventory, and the number would then be
 * useless for the one decision it exists to inform: which spaces are worth
 * keeping. Referential identity is the marker, so nothing leaks to the client.
 */
const SUPPRESSED: ServeResult = {
  poolSize: 0,
  rotateMs: 0,
  interstitialSeconds: 5,
  ad: null,
};

/** Viewer attributes targeting can filter on — must cover every AdTargeting geo
 *  dimension or a rule silently matches nobody. */
const VIEWER_SELECT = {
  country: true,
  region: true,
  division: true,
  district: true,
  subDistrict: true,
  postalCode: true,
  city: true,
  gender: true,
  level: true,
  dateOfBirth: true,
  kycStatus: true,
  isBlueVerified: true,
  tags: true,
  language: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/**
 * The campaign an ad must belong to in order to serve. Applied on EVERY path —
 * interstitials used to skip it entirely, which let ads run on a paused, ended,
 * out-of-window or $0 campaign (i.e. for free). House inventory is exempt from
 * the budget floor only, never from the rest.
 */
export function servableCampaignWhere(
  cost: number,
  now: Date,
  houseOnly: boolean
): Prisma.AdCampaignWhereInput {
  return {
    status: "ACTIVE",
    ...(houseOnly ? { isHouse: true } : {}),
    AND: [
      { OR: [{ startAt: null }, { startAt: { lte: now } }] },
      { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      { OR: [{ isHouse: true }, { budget: { gte: cost } }] },
      // A suspended/banned advertiser's ads must stop, not keep running on a
      // pre-funded budget.
      { OR: [{ advertiserId: null }, { advertiser: { is: { status: "ACTIVE" } } }] },
    ],
  };
}

/**
 * Select an ad for a placement: ad-free gate → placement lookup → active/funded/
 * in-flight ads → audience targeting → weighted pick → impression bump. Shared by
 * the `/api/ads/serve` route AND server components that SSR-inject the first ad
 * (so a blocked client fetch can't hide it). Returns `{ ad: null }` when nothing
 * is eligible (incl. ad-free viewers). `countImpression` defaults true.
 */
async function serveAdInner(opts: {
  placement: string;
  userId?: string | null;
  exclude?: Iterable<string>;
  countImpression?: boolean;
  /** Admin preview: serve any ACTIVE ad on the placement (skip ad-free /
   *  targeting / budget / flight gates) and never count an impression. */
  preview?: boolean;
  /**
   * Skip AdSense/GAM and serve own/direct inventory only.
   *
   * Used when a Google slot comes back unfilled: rather than leave a hole where
   * an ad should be, the client re-requests with this and gets a house or
   * direct-sold creative. While AdSense approval is still pending this is what
   * makes the network spaces earn anything at all.
   */
  ownInventoryOnly?: boolean;
}): Promise<ServeResult> {
  const { placement, userId, preview } = opts;
  const exclude = new Set(opts.exclude ?? []);

  // Interstitial placements (REWARD/VIDEO/GAME_INTERSTITIAL) are shown before a
  // reward, so an ad-free plan still sees them — but only HOUSE inventory. They
  // are NOT exempt from the campaign gate: that exemption was letting paid ads
  // run on dead or unfunded campaigns.
  const interstitial = placement.endsWith("_INTERSTITIAL");

  // Starts as an EMPTY viewer, not null.
  //
  // Targeting was applied only when `viewer` was non-null, and `viewer` stayed
  // null for every anonymous request — so a logged-out visitor was served EVERY
  // ad on the placement regardless of country, age, gender, level or KYC rules,
  // and `bufferImpression` counted it. An advertiser paying for Bangladesh was
  // billed for impressions from anywhere, ad-free plans were ignored, and every
  // live creative plus its `targetUrl` was enumerable without an account.
  // `serveFeedAds` below already does it this way and always filters; this is
  // that behaviour, applied to the banner path too. `matchesTargeting({}, {})`
  // correctly passes an untargeted ad and rejects a targeted one.
  let viewer: TargetableUser = {};
  let houseOnly = false;
  if (userId && !preview) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: VIEWER_SELECT,
        // Targeting attributes (country/gender/level…) change rarely.
        cacheStrategy: { ttl: 60, swr: 300 },
      }),
    ]);
    if (pkg?.adFree && !interstitial) return SUPPRESSED; // Watch & Earn is unaffected
    houseOnly = !!pkg?.adFree;
    viewer = { ...(u ?? {}), packageSlug: pkg?.slug ?? null };
  }

  // Full-screen frequency cap. Checked before the placement lookup so a capped
  // user costs one cheap limiter query rather than the whole serve path.
  //
  // Returning EMPTY is the entire mechanism: `AdInterstitialOverlay` calls
  // `onDone()` immediately when the serve has no ad, so a capped user's reward
  // is neither delayed nor blocked — they simply aren't shown one. See
  // ad-frequency.ts for why the cap has to exist at all.
  //
  // Skipped for previews (an admin looking at a space must always see it) and
  // for anonymous viewers (there is no per-user budget to spend).
  if (!preview && userId && isFrequencyCapped(placement)) {
    const slot = await claimInterstitialSlot(userId, placement);
    if (!slot.allowed) return SUPPRESSED;
  }

  const placementRow = await prisma.adPlacement.findFirst({
    where: { name: placement, isActive: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  if (!placementRow) return EMPTY;

  // Per-space click price, falling back to the global one. This is the budget
  // FLOOR here, not a charge — an ad may only serve if its campaign can afford
  // a click on this particular space.
  const cost = await getPlacementClickCost(placement);
  const now = new Date();
  // The eligible pool is IDENTICAL for every viewer of a placement, so it is a
  // textbook shared read: cache it. Targeting and the weighted pick still run
  // per request in JS below, so rotation variety is unchanged. `take` also caps
  // the response so a placement with many ads can't hit Accelerate's payload
  // limit (P6009), which is explicitly non-retryable.
  const allAds = await prisma.ad.findMany({
    where: {
      placementId: placementRow.id,
      status: "ACTIVE",
      // Admin preview (ads.view-gated, never counts an impression) is the only
      // path allowed to look past the campaign gate, so an admin can still see
      // what a space renders while a campaign is paused.
      ...(preview ? {} : { campaign: servableCampaignWhere(cost, now, houseOnly) }),
      ...(opts.ownInventoryOnly ? { type: { notIn: ["ADSENSE", "GAM"] } } : {}),
    },
    include: { campaign: { select: { title: true } } },
    take: 50,
    ...(preview ? {} : { cacheStrategy: { ttl: 30, swr: 120 } }),
  });

  // Always filter. See the note on `viewer` above.
  const targeted = allAds.filter((a) => matchesTargeting(a.targeting, viewer));
  if (targeted.length === 0) return EMPTY;

  // A space rented outright belongs to its buyer for the period.
  //
  // The guard is the important half: if the booked campaign has nothing
  // servable right now — every creative paused, rejected, or filtered out by
  // targeting — the space falls through to the normal pool rather than going
  // dark. An empty space is the failure mode Phase 2 existed to kill, and a
  // sponsor who paid for a month would not thank anyone for a blank rectangle.
  // Previews skip this: an admin looking at a space must see what it holds.
  let pool = targeted;
  if (!preview) {
    const booking = await getActiveBooking(placementRow.id, now);
    if (booking?.exclusive) {
      const booked = targeted.filter((a) => a.campaignId === booking.campaignId);
      if (booked.length > 0) pool = booked;
    }
  }

  const fresh = pool.filter((a) => !exclude.has(a.id));
  const ads = fresh.length > 0 ? fresh : pool;

  // Weighted pick.
  const totalWeight = ads.reduce((sum, a) => sum + (a.weight ?? 10), 0);
  let pick = Math.random() * totalWeight;
  let chosen = ads[0];
  for (const ad of ads) {
    pick -= ad.weight ?? 10;
    if (pick <= 0) {
      chosen = ad;
      break;
    }
  }

  const counted = opts.countImpression !== false && !preview;

  const rotateSecondsRaw =
    placementRow.rotationSeconds ??
    (await getSetting<number>("ads.rotation_seconds", 12));
  const rotateSeconds = Math.min(60, Math.max(5, Number(rotateSecondsRaw) || 12));
  const interstitialSeconds = Math.min(
    60,
    Math.max(3, placementRow.interstitialSeconds ?? 5)
  );

  const proxy = isFirstPartyAdType(chosen.type);
  // Network types (ADSENSE/GAM) ship their SLOT CONFIG, not markup.
  //
  // They used to be composed into a self-contained document here and rendered in
  // a sandboxed iframe, so every slot loaded its own copy of Google's script.
  // The client now renders a real in-page `<ins>` / GPT slot from this config,
  // against the single page-level tag in the root layout — the only arrangement
  // Google supports, and the only one that fills properly.
  const html = chosen.htmlContent ?? undefined;
  let network: NetworkSlotConfig | undefined;
  if (chosen.type === "ADSENSE" || chosen.type === "GAM") {
    network =
      resolveNetworkSlot(chosen, await getNetworkGlobals(), placement) ??
      undefined;
    // Incomplete network setup — the normal state before an account exists.
    // Serving nothing is right: it keeps every Google reference off the page.
    if (!network) return EMPTY;
  }

  // The impression is counted HERE, after every path that can still decide not
  // to serve.
  //
  // It used to be counted at the weighted pick above, which is before the
  // network-config check — so an AdSense ad with no slot id recorded an
  // impression for a creative the viewer never saw, and inflated the numbers of
  // exactly the ad type that can least afford to look wrong to Google.
  if (counted) {
    // Buffered — see src/lib/ad-counters.ts. This used to be two hot-row writes
    // per served ad, on the few rows currently in rotation.
    bufferImpression(chosen.id);
  }

  return {
    poolSize: ads.length,
    rotateMs: rotateSeconds * 1000,
    interstitialSeconds,
    countedServerSide: counted,
    ad: {
      id: chosen.id,
      type: chosen.type,
      imageUrl: chosen.contentUrl
        ? proxy
          ? firstPartyMediaUrl(chosen.id, "img")
          : chosen.contentUrl
        : undefined,
      videoUrl: chosen.videoUrl
        ? proxy
          ? firstPartyMediaUrl(chosen.id, "video")
          : chosen.videoUrl
        : undefined,
      title: chosen.campaign.title,
      body: undefined,
      ctaLabel: "Learn More",
      ctaUrl: chosen.targetUrl ?? undefined,
      html,
      network,
      sponsor: undefined,
      size: chosen.size ?? undefined,
      width: chosen.width ?? undefined,
      height: chosen.height ?? undefined,
      impressionPixel: chosen.impressionPixel ?? undefined,
      clickTracker: chosen.clickTracker ?? undefined,
      allowSameOrigin: chosen.allowSameOrigin || undefined,
    },
  };
}

/**
 * Select an ad for a placement, and record whether the request was filled.
 *
 * The recording is the reason this wrapper exists. `serveAdInner` has eight paths
 * that return no ad, and instrumenting each of them would guarantee that the next
 * early return added silently stops counting — the denominator would drift away
 * from the numerator and nobody would notice, because the number would still look
 * plausible. Counting once, here, at the single boundary, cannot drift.
 *
 * Two outcomes are deliberately NOT counted:
 *
 *  - **Suppression** (ad-free plan, frequency cap). Nothing was missing; an ad was
 *    withheld on purpose. Counting it would make every space look starved for
 *    reasons that have nothing to do with inventory.
 *  - **Previews.** An admin looking at a space is not a viewer.
 *
 * Never throws and never delays the serve: a failure to record a diagnostic must
 * not cost a real impression.
 */
export async function serveAd(opts: {
  placement: string;
  userId?: string | null;
  exclude?: Iterable<string>;
  countImpression?: boolean;
  preview?: boolean;
  ownInventoryOnly?: boolean;
}): Promise<ServeResult> {
  const result = await serveAdInner(opts);
  if (!opts.preview && result !== SUPPRESSED) {
    // Fire-and-forget. The placement id is resolved from the same cached read
    // `serveAdInner` just made, so this is a cache hit rather than a query.
    void recordServeOutcome(opts.placement, !!result.ad);
  }
  return result;
}

async function recordServeOutcome(placement: string, filled: boolean) {
  try {
    const row = await prisma.adPlacement.findFirst({
      where: { name: placement, isActive: true },
      select: { id: true },
      cacheStrategy: { ttl: 30, swr: 60 },
    });
    // An unknown or inactive space has no row to attribute the request to. That
    // is a configuration problem, not a fill problem, and it is already visible
    // in the placement list.
    if (row) bufferServeOutcome(row.id, filled);
  } catch {
    /* a diagnostic must never break ad serving */
  }
}

/** Order items by a weighted-random draw (higher weight → earlier, on average). */
function weightedShuffle<T extends { weight: number | null }>(items: T[]): T[] {
  return [...items]
    .map((item) => ({
      item,
      key: Math.pow(Math.random(), 1 / Math.max(item.weight ?? 10, 1)),
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/**
 * Select up to `count` NATIVE in-feed ads for the viewer, shaped like a post and
 * with first-party-proxied brand creatives. Shared by `/api/ads/feed` (client
 * rotation) and the feed page's SSR injection. Returns `[]` for ad-free viewers
 * or when nothing is eligible.
 */
export async function serveFeedAds(opts: {
  userId?: string | null;
  count: number;
  exclude?: Iterable<string>;
}): Promise<FeedAd[]> {
  const { userId } = opts;
  const count = Math.min(Math.max(opts.count, 1), 20);
  const exclude = new Set(opts.exclude ?? []);

  let viewer: TargetableUser = {};
  if (userId) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: VIEWER_SELECT,
        // Targeting attributes (country/gender/level…) change rarely.
        cacheStrategy: { ttl: 60, swr: 300 },
      }),
    ]);
    if (pkg?.adFree) return [];
    viewer = { ...(u ?? {}), packageSlug: pkg?.slug ?? null };
  }

  const placement = await prisma.adPlacement.findFirst({
    where: { name: "IN_FEED", isActive: true },
    select: { id: true },
  });
  if (!placement) return [];

  // IN_FEED has its own rate on the card, like every other space.
  const cost = await getPlacementClickCost("IN_FEED");
  const now = new Date();
  const ads = await prisma.ad.findMany({
    where: {
      placementId: placement.id,
      status: "ACTIVE",
      format: "NATIVE",
      campaign: servableCampaignWhere(cost, now, false),
    },
    select: {
      id: true,
      weight: true,
      headline: true,
      brandName: true,
      brandLogo: true,
      ctaLabel: true,
      contentUrl: true,
      videoUrl: true,
      targetUrl: true,
      targeting: true,
      promotedPostId: true,
    },
  });

  const eligible = ads.filter((a) => matchesTargeting(a.targeting, viewer));
  const unseen = eligible.filter((a) => !exclude.has(a.id));
  const pool = unseen.length > 0 ? unseen : eligible;
  const picked = weightedShuffle(pool).slice(0, count);

  // Resolve promoted posts (author + content) in one batch.
  const postIds = picked
    .map((a) => a.promotedPostId)
    .filter((x): x is string => !!x);
  const posts = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          content: true,
          images: true,
          backgroundStyle: true,
          user: {
            select: {
              name: true,
              username: true,
              avatar: true,
              isBlueVerified: true,
              verifiedBadgeStyle: true,
            },
          },
        },
      })
    : [];
  const postMap = new Map(posts.map((p) => [p.id, p]));

  return picked
    .map((a): FeedAd | null => {
      if (a.promotedPostId) {
        const p = postMap.get(a.promotedPostId);
        if (!p) return null;
        return {
          adId: a.id,
          kind: "post",
          author: {
            name: p.user?.name ?? p.user?.username ?? "User",
            username: p.user?.username ?? null,
            avatar: p.user?.avatar ?? null,
            isBlueVerified: p.user?.isBlueVerified ?? false,
            verifiedBadgeStyle: p.user?.verifiedBadgeStyle ?? null,
          },
          content: p.content ?? "",
          images: p.images ?? [],
          videoUrl: null,
          backgroundStyle: p.backgroundStyle ?? null,
          ctaLabel: a.ctaLabel || "Learn More",
          targetUrl: a.targetUrl ?? null,
        };
      }
      // Custom brand creative — first-party-proxied image/logo/video.
      return {
        adId: a.id,
        kind: "brand",
        author: {
          name: a.brandName || "Sponsored",
          username: null,
          avatar: a.brandLogo ? firstPartyMediaUrl(a.id, "logo") : null,
          isBlueVerified: false,
          verifiedBadgeStyle: null,
        },
        content: a.headline ?? "",
        images: a.contentUrl ? [firstPartyMediaUrl(a.id, "img")] : [],
        videoUrl: a.videoUrl ? firstPartyMediaUrl(a.id, "video") : null,
        backgroundStyle: null,
        ctaLabel: a.ctaLabel || "Learn More",
        targetUrl: a.targetUrl ?? null,
      };
    })
    .filter((x): x is FeedAd => x !== null);
}
