import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdClickCost } from "@/lib/ad-billing";
import { bumpAdDailyStat } from "@/lib/ad-stats";

// Per-(user,ad) click cooldown to stop budget-drain click fraud. In-memory
// (per-instance) is a lightweight first defense on top of auth + the budget CAS.
const CLICK_COOLDOWN_MS = 30_000;
const recentClicks = new Map<string, number>();

/**
 * Records an authenticated ad click and bills the owning campaign's budget. A
 * click is only BILLED once per (user, ad) within a cooldown window — so a bot
 * can't drain a rival advertiser's budget by hammering this endpoint. The
 * `budget >= cost` CAS is the no-overspend guard; billing/counting never blocks.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Only logged-in users can bill a click (ads are served to authenticated users).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: true, billed: false });
  }
  const userId = session.user.id;

  // Dedup: same user clicking the same ad within the cooldown isn't re-billed.
  const key = `${userId}:${id}`;
  const now = Date.now();
  const last = recentClicks.get(key);
  if (last && now - last < CLICK_COOLDOWN_MS) {
    return NextResponse.json({ success: true, billed: false });
  }
  recentClicks.set(key, now);
  if (recentClicks.size > 5000) {
    // Bound the map — drop entries older than the cooldown.
    for (const [k, t] of recentClicks) if (now - t > CLICK_COOLDOWN_MS) recentClicks.delete(k);
  }

  const ad = await prisma.ad
    .update({
      where: { id },
      data: { clicks: { increment: 1 } },
      select: { campaignId: true },
    })
    .catch(() => null);

  if (ad?.campaignId) {
    const cost = await getAdClickCost();
    // Atomic, no-overspend: only decrements when the budget still covers a click.
    const billed = await prisma.adCampaign.updateMany({
      where: { id: ad.campaignId, status: "ACTIVE", budget: { gte: cost } },
      data: { budget: { decrement: cost } },
    });
    // Roll up click + actual spend (0 when the campaign couldn't be billed).
    await bumpAdDailyStat(id, {
      clicks: 1,
      spendUsd: billed.count > 0 ? cost : 0,
    });
    if (billed.count === 0) {
      // Out of budget — pause so it drops out of rotation.
      await prisma.adCampaign
        .updateMany({
          where: { id: ad.campaignId, status: "ACTIVE" },
          data: { status: "PAUSED" },
        })
        .catch(() => {});
    }
  } else {
    await bumpAdDailyStat(id, { clicks: 1 });
  }

  return NextResponse.json({ success: true });
}
