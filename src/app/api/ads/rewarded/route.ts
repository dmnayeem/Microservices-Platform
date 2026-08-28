import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { creativeUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
import { getAdClickCost } from "@/lib/ad-billing";
import { servableCampaignWhere } from "@/lib/ad-serve";
import { getRewardedConfig, signWatchToken } from "@/lib/ads-rewarded";
import { getUserDayContext } from "@/lib/user-day";

/**
 * List watch-to-earn ads with each ad's cooldown state for the current user.
 *
 * Returns `{ enabled: false, ads: [] }` while `ads.rewarded_enabled` is off,
 * which is the shipped default — a rewarded ad pays points OUT, and with only
 * house inventory that is a cost to the owner and no revenue. See
 * `src/lib/ads-rewarded.ts`.
 *
 * Each ad carries a signed **watch token** issued at this moment. The reward
 * route requires it and will not credit until `watchSeconds` have elapsed since
 * it was issued, which is what makes `Ad.watchSeconds` mean anything at all —
 * before this, a bare POST credited immediately.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const cfg = await getRewardedConfig();
  if (!cfg.enabled || cfg.dailyCap <= 0) {
    return NextResponse.json({ enabled: false, ads: [] });
  }

  // Same campaign gate as every other serve path — this list used to check only
  // `campaign.status`, so an out-of-budget, expired or suspended advertiser's ad
  // still earned users points at the platform's expense.
  const ads = await prisma.ad.findMany({
    where: {
      status: "ACTIVE",
      rewardPoints: { gt: 0 },
      campaign: servableCampaignWhere(await getAdClickCost(), new Date(), false),
    },
    include: { campaign: { select: { title: true } } },
    take: 50,
  });

  const now = Date.now();

  // One grouped query for every ad's last view, instead of one findFirst per ad
  // (this list is up to 50 ads, so it was up to 51 round-trips per request).
  // Served by @@index([userId, adId, createdAt]).
  const lastViews = (await prisma.adView.groupBy({
    by: ["adId"],
    where: { userId, adId: { in: ads.map((a) => a.id) } },
    _max: { createdAt: true },
  })) as unknown as { adId: string; _max: { createdAt: Date | null } }[];
  const lastViewByAd = new Map(
    lastViews.map((v) => [v.adId, v._max.createdAt ?? null])
  );

  // Progress against the daily cap, so the UI can show it rather than letting a
  // user watch an ad and only then be told they earned nothing.
  const { startOfDayUtc } = await getUserDayContext(userId);
  const earned = (await prisma.adView.aggregate({
    where: { userId, createdAt: { gte: startOfDayUtc } },
    _sum: { rewardedPoints: true },
  })) as unknown as { _sum: { rewardedPoints: number | null } };
  const todayEarned = earned._sum.rewardedPoints ?? 0;
  const remaining = Math.max(0, cfg.dailyCap - todayEarned);

  const result = ads.map((ad) => {
    const last = lastViewByAd.get(ad.id) ?? null;
    const cooldownEndsAt = last
      ? last.getTime() + ad.rewardCooldownSec * 1000
      : 0;
    const cooldownRemaining = Math.max(0, Math.ceil((cooldownEndsAt - now) / 1000));
    const proxy = isFirstPartyAdType(ad.type);
    return {
      id: ad.id,
      title: ad.brandName || ad.campaign.title,
      headline: ad.headline ?? null,
      type: ad.type,
      format: ad.format,
      // `videoUrl` was missing entirely, which is why a "watch a video to earn"
      // screen could not be built on this route as it stood.
      videoUrl: creativeUrl(ad.id, "video", ad.videoUrl, proxy) ?? null,
      imageUrl: creativeUrl(ad.id, "img", ad.contentUrl, proxy) ?? null,
      html: ad.htmlContent ?? null,
      ctaLabel: ad.ctaLabel ?? "Learn More",
      targetUrl: ad.targetUrl ?? null,
      rewardPoints: ad.rewardPoints,
      watchSeconds: ad.watchSeconds,
      cooldownRemaining,
      // Bound to this user and this ad, and useless for any other. Issued even
      // while on cooldown — the reward route re-checks everything anyway, and
      // withholding it here would only move the failure later.
      watchToken: signWatchToken(userId, ad.id),
    };
  });

  return NextResponse.json({
    enabled: true,
    ads: result,
    dailyCap: cfg.dailyCap,
    todayEarned,
    remaining,
  });
}
