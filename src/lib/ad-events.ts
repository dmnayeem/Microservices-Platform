import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { clicksAreBillable, getPlacementClickCost } from "@/lib/ad-rate-card";
import { bumpAdDailyStat } from "@/lib/ad-stats";
import { bufferImpression } from "@/lib/ad-counters";
// `ad-serve` does not import this module, so there is no cycle.
import { servableCampaignWhere } from "@/lib/ad-serve";

/**
 * Shared ad impression/click recording. Used by the neutral `/api/spaces/:id/
 * event` endpoint AND the legacy `/api/ads/:id/(impression|click)` routes so the
 * billing logic lives in exactly one place.
 *
 * Dedup is DB-backed (`AdEngagement`), not an in-memory map. The old map was
 * per serverless instance, so parallel requests landing on different instances
 * each got a free pass — enough to drain a rival campaign's budget, or to
 * inflate/dilute any ad's impressions.
 */

const CLICK_COOLDOWN_MS = 30_000;
const VIEW_COOLDOWN_MS = 60_000;

/** Stable, non-identifying subject key for an anonymous viewer. */
export function ipSubject(ip: string): string {
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * Claim a (ad, kind, subject) slot for the current time bucket. The unique index
 * IS the cooldown: a P2002 means "already counted in this window".
 */
async function claimSlot(opts: {
  adId: string;
  kind: "VIEW" | "CLICK";
  subject: string;
  userId?: string | null;
  windowMs: number;
}): Promise<{ id: string } | null> {
  const bucket = BigInt(Math.floor(Date.now() / opts.windowMs));
  try {
    return await prisma.adEngagement.create({
      data: {
        adId: opts.adId,
        kind: opts.kind,
        subject: opts.subject,
        userId: opts.userId ?? null,
        bucket,
      },
      select: { id: true },
    });
  } catch {
    return null; // duplicate within the window, or the ad vanished
  }
}

/**
 * Record an impression. Deduped per (ad, viewer, minute) and only counted for an
 * ad that is actually live — otherwise anyone could POST a view for any ad id.
 * Returns whether it counted.
 */
export async function recordImpression(
  adId: string,
  opts: { subject: string; userId?: string | null }
): Promise<{ counted: boolean }> {
  const ad = await prisma.ad
    .findUnique({ where: { id: adId }, select: { status: true } })
    .catch(() => null);
  if (ad?.status !== "ACTIVE") return { counted: false };

  const slot = await claimSlot({
    adId,
    kind: "VIEW",
    subject: opts.subject,
    userId: opts.userId,
    windowMs: VIEW_COOLDOWN_MS,
  });
  if (!slot) return { counted: false };

  // Buffered (src/lib/ad-counters.ts) — the AdEngagement row above is already
  // the durable, deduped record of this view; the counters are a rollup and do
  // not need to be written synchronously on a hot row.
  bufferImpression(adId);
  return { counted: true };
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
  const slot = await claimSlot({
    adId,
    kind: "CLICK",
    subject: userId,
    userId,
    windowMs: CLICK_COOLDOWN_MS,
  });
  if (!slot) return { billed: false };

  // The ad's OWN status matters, not just its campaign's. A PAUSED, PENDING,
  // REJECTED or CHANGES_REQUESTED ad must never bill: the advertiser was told it
  // had stopped.
  const ad = await prisma.ad
    .findUnique({
      where: { id: adId },
      select: {
        campaignId: true,
        status: true,
        // The space decides the price now, and whether a click bills at all —
        // a flat-rate sponsor has already paid for the period.
        placementId: true,
        placement: { select: { name: true } },
        campaign: { select: { isHouse: true } },
      },
    })
    .catch(() => null);

  if (!ad?.campaignId || ad.status !== "ACTIVE") {
    await bumpAdDailyStat(adId, { clicks: 1 });
    return { billed: false };
  }

  // House inventory is the platform advertising to its own users. Billing it
  // would take the platform's money from the platform's pocket and put it into
  // `spentTotal`, which is the figure that reports "ad revenue earned" — so it
  // would report income that never existed. The click is still counted; only the
  // money movement is skipped.
  //
  // The demo campaign has been doing exactly this: seeded with a $100,000
  // budget, it had already "spent" its way down to 99998.10.
  if (ad.campaign?.isHouse) {
    await prisma.ad
      .update({ where: { id: adId }, data: { clicks: { increment: 1 } } })
      .catch(() => null);
    await bumpAdDailyStat(adId, { clicks: 1, spendUsd: 0 });
    return { billed: false };
  }

  // A space rented outright at a flat rate does not bill per click on top. The
  // sponsor bought the period; charging again for each click inside it would be
  // charging twice for the same inventory. The click is still counted, exactly
  // as a house click is — only the money movement is skipped.
  if (!(await clicksAreBillable(ad.placementId, ad.campaignId))) {
    await prisma.ad
      .update({ where: { id: adId }, data: { clicks: { increment: 1 } } })
      .catch(() => null);
    await bumpAdDailyStat(adId, { clicks: 1, spendUsd: 0 });
    return { billed: false };
  }

  // Per-space click price, falling back to the global `ads.cpcUsd` for any space
  // with no rate of its own. Whatever is resolved here is what gets snapshotted
  // into `spentTotal` and `AdDailyStat.spendUsd` below, so a later rate change
  // never rewrites this click.
  const cost = await getPlacementClickCost(ad.placement?.name);
  const now = new Date();
  // Atomic, no-overspend: only decrements when the budget still covers a click.
  // `spentTotal` moves in the same statement so reporting never has to derive
  // spend from clicks × current CPC (which rewrote history on a CPC change).
  //
  // The predicate is `servableCampaignWhere` — the SAME clause that decides
  // whether the ad may be shown at all. It used to be `status: "ACTIVE"` plus a
  // budget floor and nothing else, so a campaign whose `endAt` had passed kept
  // billing until `runAdCampaignSweep` next ran, and a suspended advertiser's
  // campaign billed against its pre-funded budget. Billing for delivery the
  // advertiser was promised had stopped is the one thing an ad system must not
  // do. (House campaigns returned above, so anything reaching here is a real
  // advertiser with a real budget.)
  const billed = await prisma.adCampaign.updateMany({
    where: { id: ad.campaignId, ...servableCampaignWhere(cost, now, false) },
    data: { budget: { decrement: cost }, spentTotal: { increment: cost } },
  });

  // Ad.clicks counts BILLED clicks only — CTR and spend both read it, and an
  // unbilled click implies money that never moved.
  if (billed.count > 0) {
    await prisma.ad
      .update({ where: { id: adId }, data: { clicks: { increment: 1 } } })
      .catch(() => null);
    await prisma.adEngagement
      .update({ where: { id: slot.id }, data: { billed: true } })
      .catch(() => null);
  }

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
