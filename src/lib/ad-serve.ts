import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { getAdClickCost } from "@/lib/ad-billing";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { getSetting } from "@/lib/system-settings";
import { bumpAdDailyStat } from "@/lib/ad-stats";
import { firstPartyMediaUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
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
}

export interface ServeResult {
  poolSize: number;
  rotateMs: number;
  interstitialSeconds: number;
  ad: ServedAd | null;
}

const EMPTY: ServeResult = {
  poolSize: 0,
  rotateMs: 0,
  interstitialSeconds: 5,
  ad: null,
};

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
}): Promise<ServeResult> {
  const { placement, userId } = opts;
  const exclude = new Set(opts.exclude ?? []);

  let viewer: TargetableUser | null = null;
  if (userId) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          country: true,
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
        },
      }),
    ]);
    if (pkg?.adFree) return EMPTY; // Watch & Earn is unaffected
    viewer = { ...(u ?? {}), packageSlug: pkg?.slug ?? null };
  }

  const placementRow = await prisma.adPlacement.findFirst({
    where: { name: placement, isActive: true },
    cacheStrategy: { ttl: 30, swr: 60 },
  });
  if (!placementRow) return EMPTY;

  const cost = await getAdClickCost();
  const now = new Date();
  const allAds = await prisma.ad.findMany({
    where: {
      placementId: placementRow.id,
      status: "ACTIVE",
      campaign: {
        status: "ACTIVE",
        budget: { gte: cost },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
    },
    include: { campaign: { select: { title: true } } },
  });

  const targeted = viewer
    ? allAds.filter((a) => matchesTargeting(a.targeting, viewer))
    : allAds;
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

  if (opts.countImpression !== false) {
    prisma.ad
      .update({
        where: { id: chosen.id },
        data: { impressions: { increment: 1 } },
      })
      .catch(() => {});
    void bumpAdDailyStat(chosen.id, { impressions: 1 });
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
  return {
    poolSize: targeted.length,
    rotateMs: rotateSeconds * 1000,
    interstitialSeconds,
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
      html: chosen.htmlContent ?? undefined,
      sponsor: undefined,
      size: chosen.size ?? undefined,
      width: chosen.width ?? undefined,
      height: chosen.height ?? undefined,
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
        select: {
          country: true,
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
        },
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
      campaign: {
        status: "ACTIVE",
        budget: { gte: cost },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
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
