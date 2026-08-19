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
  const result = await Promise.all(
    ads.map(async (ad) => {
      const last = await prisma.adView.findFirst({
        where: { userId: session.user.id, adId: ad.id },
        orderBy: { createdAt: "desc" },
      });
      const cooldownEndsAt = last
        ? last.createdAt.getTime() + ad.rewardCooldownSec * 1000
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
