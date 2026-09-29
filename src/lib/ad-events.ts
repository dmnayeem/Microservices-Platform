import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { clicksAreBillable, getPlacementClickCost } from "@/lib/ad-rate-card";
import { bumpAdDailyStat } from "@/lib/ad-stats";
import { resolveEventCountry } from "@/lib/ad-geo";
// `ad-serve` does not import this module, so there is no cycle.
import { servableCampaignWhere } from "@/lib/ad-serve";
import { verifyAdServeToken } from "@/lib/ad-serve-token";

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

/**
 * Click dedup window. MUST NOT be shorter than `VIEW_COOLDOWN_MS`.
 *
 * It was 30s against a 60s view window, and the two windows are what CTR is
 * made of: one impression is counted per (ad, viewer, minute), but two clicks
 * could be counted inside that same minute. A viewer who clicks, comes back and
 * clicks again 31 seconds later produced 2 clicks against 1 impression — a
 * CTR above 100%, which is not a rounding artefact but an impossible number,
 * and the advertiser was billed for the second click as well.
 *
 * That was live: ad cmt7d8f5y0407g8mg8eqqt5gu on PACKAGES_TOP sat at 4 clicks
 * against 3 impressions. Aligning the windows makes a billed click impossible
 * without an impression to hang it on.
 */
const CLICK_COOLDOWN_MS = 60_000;
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

  // NOTE: this deliberately does NOT touch the impression counters any more.
  //
  // Impressions are counted on exactly one basis platform-wide — server-side, at
  // delivery, in `serveAd` and `serveFeedAds` (see the long note at the foot of
  // `serveFeedAds` for why that ruler and not this one). This path used to be
  // the sole counter for IN_FEED, on a *different* basis (deduped per ad, per
  // viewer, per minute), which is precisely what made the feed look ~10x weaker
  // than every other space in the same report table.
  //
  // Now that `serveFeedAds` counts at delivery, incrementing here as well would
  // double-count every feed ad. What this function still does is the part only
  // it can do: write the durable, deduped, user-attributed `AdEngagement` row —
  // the record that says a specific viewer actually rendered this creative, and
  // the rate-limited fraud guard on views. That row is untouched.
  return { counted: true };
}

/**
 * Record an authenticated click and bill the owning campaign. A click is BILLED
 * only with a valid serve token (once per token), and once per (user, ad)
 * within a cooldown window, so a bot can't drain a rival's budget. The `budget >= cost` CAS is the no-overspend guard. Returns whether
 * the click was billed (false when deduped or out of budget).
 */
export async function recordClick(
  adId: string,
  userId: string,
  opts: { serveToken?: unknown } = {}
): Promise<{ billed: boolean }> {
  // A click is billable only on an ad we actually served to this viewer: the
  // serve path stamped it with a signed, 30-minute token bound to (ad, user).
  // Without one the click still navigates (the caller never blocks on this),
  // but nothing is counted or billed — it is not a click on a delivered ad.
  const served = verifyAdServeToken(opts.serveToken, adId, userId);
  if (!served) return { billed: false };

  const slot = await claimSlot({
    adId,
    kind: "CLICK",
    subject: userId,
    userId,
    windowMs: CLICK_COOLDOWN_MS,
  });
  if (!slot) return { billed: false };

  // At most one billed click per serve. The unique index on
  // (adId, kind, subject, bucket) is the guard; bucket 0 = "forever" (the
  // token itself expires in 30 minutes, retention prunes the row at 30 days).
  const tokenClaimed = await prisma.adEngagement
    .create({
      data: { adId, kind: "SERVE_TOKEN", subject: `st:${served.nonce}`, userId, bucket: BigInt(0) },
      select: { id: true },
    })
    .then(() => true)
    .catch(() => false);
  if (!tokenClaimed) return { billed: false };

  // Resolved once, at the top, and threaded through every exit below.
  //
  // An impression and the click on it MUST land in the same bucket or the
  // per-country CTR is a ratio of two different populations. Resolving it once
  // here — rather than at each of the four `bumpAdDailyStat` calls below — is
  // what makes that true no matter which branch this click takes.
  const country = await resolveEventCountry({ userId });

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
    await bumpAdDailyStat(adId, { clicks: 1 }, country);
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
    await bumpAdDailyStat(adId, { clicks: 1, spendUsd: 0 }, country);
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
    await bumpAdDailyStat(adId, { clicks: 1, spendUsd: 0 }, country);
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

  await bumpAdDailyStat(
    adId,
    { clicks: 1, spendUsd: billed.count > 0 ? cost : 0 },
    country
  );

  if (billed.count === 0) {
    // Out of budget — pause so it drops out of rotation.
    //
    // Only when the budget is what failed. The CAS above also fails for a
    // campaign past its `endAt` or with a suspended advertiser; pausing those
    // took them out of `runAdCampaignSweep`'s ACTIVE-only "ended → refund"
    // pass, so the unspent budget sat locked in a PAUSED campaign.
    await prisma.adCampaign
      .updateMany({
        where: { id: ad.campaignId, status: "ACTIVE", budget: { lt: cost } },
        data: { status: "PAUSED" },
      })
      .catch(() => {});
  }
  return { billed: billed.count > 0 };
}
