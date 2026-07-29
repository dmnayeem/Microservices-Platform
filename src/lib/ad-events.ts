import { prisma } from "@/lib/prisma";
import { getAdClickCost } from "@/lib/ad-billing";
import { bumpAdDailyStat } from "@/lib/ad-stats";

/**
 * Shared ad impression/click recording. Used by the neutral `/api/spaces/:id/
 * event` endpoint AND the legacy `/api/ads/:id/(impression|click)` routes so the
 * billing logic lives in exactly one place.
 */

// Per-(user,ad) click cooldown to stop budget-drain click fraud. In-memory
// (per-instance) is a lightweight first defense on top of auth + the budget CAS.
const CLICK_COOLDOWN_MS = 30_000;
const recentClicks = new Map<string, number>();

/** Record an impression (fire-and-forget): lifetime counter + today's rollup. */
export async function recordImpression(adId: string): Promise<void> {
  await prisma.ad
    .update({ where: { id: adId }, data: { impressions: { increment: 1 } } })
    .catch(() => null);
  await bumpAdDailyStat(adId, { impressions: 1 });
}

/**
 * Record an authenticated click and bill the owning campaign. A click is BILLED
 * once per (user, ad) within a cooldown window so a bot can't drain a rival's
 * budget. The `budget >= cost` CAS is the no-overspend guard. Returns whether
 * the click was billed (false when deduped or out of budget).
 */
export async function recordClick(
  adId: string,
  userId: string
): Promise<{ billed: boolean }> {
  const key = `${userId}:${adId}`;
  const now = Date.now();
  const last = recentClicks.get(key);
  if (last && now - last < CLICK_COOLDOWN_MS) {
    return { billed: false };
  }
  recentClicks.set(key, now);
  if (recentClicks.size > 5000) {
    for (const [k, t] of recentClicks)
      if (now - t > CLICK_COOLDOWN_MS) recentClicks.delete(k);
  }

  const ad = await prisma.ad
    .update({
      where: { id: adId },
      data: { clicks: { increment: 1 } },
      select: { campaignId: true },
    })
    .catch(() => null);

  if (!ad?.campaignId) {
    await bumpAdDailyStat(adId, { clicks: 1 });
    return { billed: false };
  }

  const cost = await getAdClickCost();
  // Atomic, no-overspend: only decrements when the budget still covers a click.
  const billed = await prisma.adCampaign.updateMany({
    where: { id: ad.campaignId, status: "ACTIVE", budget: { gte: cost } },
    data: { budget: { decrement: cost } },
  });
  await bumpAdDailyStat(adId, {
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
  return { billed: billed.count > 0 };
}
