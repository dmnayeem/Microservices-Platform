import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

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

/** Legacy view-engagement dedup window (per ad, viewer, minute). */
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

/*
 * `recordClick` lived here. Clicks are now measured and billed in
 * src/lib/ad-measure.ts (`ingestAdEvent`), reached through the click redirect
 * `/api/spaces/go?st=…`: the serve token is validated, judged by the IVT rules
 * and claimed once per delivery in `AdEvent` before any money moves.
 */
