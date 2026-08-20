import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firstPartyMediaUrl } from "@/lib/ad-proxy";
import { getAdClickCost } from "@/lib/ad-billing";
import { servableCampaignWhere } from "@/lib/ad-serve";

/** List active reward ads with each ad's cooldown state for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    where: { userId: session.user.id, adId: { in: ads.map((a) => a.id) } },
    _max: { createdAt: true },
  })) as unknown as { adId: string; _max: { createdAt: Date | null } }[];
  const lastViewByAd = new Map(
    lastViews.map((v) => [v.adId, v._max.createdAt ?? null])
  );

  const result = await Promise.all(
    ads.map(async (ad) => {
      const last = lastViewByAd.get(ad.id) ?? null;
      const cooldownEndsAt = last
        ? last.getTime() + ad.rewardCooldownSec * 1000
        : 0;
      const cooldownRemaining = Math.max(0, Math.ceil((cooldownEndsAt - now) / 1000));
      return {
        id: ad.id,
        title: ad.campaign.title,
        format: ad.format,
        imageUrl: ad.contentUrl ? firstPartyMediaUrl(ad.id, "img") : null,
        html: ad.htmlContent ?? null,
        targetUrl: ad.targetUrl ?? null,
        rewardPoints: ad.rewardPoints,
        watchSeconds: ad.watchSeconds,
        cooldownRemaining,
      };
    })
  );

  return NextResponse.json({ ads: result });
}
