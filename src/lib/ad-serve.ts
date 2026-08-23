import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { getAdClickCost } from "@/lib/ad-billing";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { getSetting } from "@/lib/system-settings";
import { bufferImpression } from "@/lib/ad-counters";
import { firstPartyMediaUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
import { composeNetworkAdHtml, getNetworkGlobals } from "@/lib/ad-network";
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
export async function serveAd(opts: {
  placement: string;
  userId?: string | null;
  exclude?: Iterable<string>;
  countImpression?: boolean;
  /** Admin preview: serve any ACTIVE ad on the placement (skip ad-free /
   *  targeting / budget / flight gates) and never count an impression. */
  preview?: boolean;
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
    if (pkg?.adFree && !interstitial) return EMPTY; // Watch & Earn is unaffected
    houseOnly = !!pkg?.adFree;
    viewer = { ...(u ?? {}), packageSlug: pkg?.slug ?? null };
  }

  const placementRow = await prisma.adPlacement.findFirst({
    where: { name: placement, isActive: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  if (!placementRow) return EMPTY;

  const cost = await getAdClickCost();
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
    },
    include: { campaign: { select: { title: true } } },
    take: 50,
    ...(preview ? {} : { cacheStrategy: { ttl: 30, swr: 120 } }),
  });

  // Always filter. See the note on `viewer` above.
  const targeted = allAds.filter((a) => matchesTargeting(a.targeting, viewer));
  if (targeted.length === 0) return EMPTY;

  const fresh = targeted.filter((a) => !exclude.has(a.id));
  const ads = fresh.length > 0 ? fresh : targeted;

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
  if (counted) {
    // Buffered — see src/lib/ad-counters.ts. This used to be two hot-row writes
    // per served ad, on the few rows currently in rotation.
    bufferImpression(chosen.id);
  }

  const rotateSecondsRaw =
    placementRow.rotationSeconds ??
    (await getSetting<number>("ads.rotation_seconds", 12));
  const rotateSeconds = Math.min(60, Math.max(5, Number(rotateSecondsRaw) || 12));
  const interstitialSeconds = Math.min(
    60,
    Math.max(3, placementRow.interstitialSeconds ?? 5)
  );

  const proxy = isFirstPartyAdType(chosen.type);
  // Network types (ADSENSE/GAM): compose a self-contained document server-side;
  // fall back to any raw htmlContent when config is incomplete.
  let html = chosen.htmlContent ?? undefined;
  if (chosen.type === "ADSENSE" || chosen.type === "GAM") {
    const composed = composeNetworkAdHtml(chosen, await getNetworkGlobals());
    if (composed) html = composed;
  }
  return {
    poolSize: targeted.length,
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

  const cost = await getAdClickCost();
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
