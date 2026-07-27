import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectivePackage } from "@/lib/packages";
import { getAdClickCost } from "@/lib/ad-billing";
import { matchesTargeting, type TargetableUser } from "@/lib/ad-targeting";
import { getSetting } from "@/lib/system-settings";
import { bumpAdDailyStat } from "@/lib/ad-stats";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  // Client-remembered last-shown ad id(s) for this placement — avoid an
  // immediate repeat (rotation).
  const exclude = new Set(
    (searchParams.get("exclude") ?? "").split(",").filter(Boolean)
  );

  if (!placement) {
    return NextResponse.json({ error: "placement required" }, { status: 400 });
  }

  // Load the viewer once: ad-free gate + audience-targeting attributes.
  const session = await auth();
  let viewer: TargetableUser | null = null;
  if (session?.user?.id) {
    const [pkg, u] = await Promise.all([
      getEffectivePackage(session.user.id),
      prisma.user.findUnique({
        where: { id: session.user.id },
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
    if (pkg?.adFree) {
      return NextResponse.json({ ad: null }); // Watch & Earn is unaffected
    }
    viewer = { ...(u ?? {}), packageSlug: pkg?.slug ?? null };
  }

  // Find placement by name
  const placementRow = await prisma.adPlacement.findFirst({
    where: { name: placement, isActive: true },
  });
  if (!placementRow) {
    return NextResponse.json({ ad: null });
  }

  // Get active ads for this placement. Exclude campaigns whose remaining budget
  // can't cover another billed click so we never show an ad we can't charge for.
  const cost = await getAdClickCost();
  const now = new Date();
  const allAds = await prisma.ad.findMany({
    where: {
      placementId: placementRow.id,
      status: "ACTIVE",
      campaign: {
        status: "ACTIVE",
        budget: { gte: cost },
        // Flight window — only serve while now ∈ [startAt, endAt] (nulls = open).
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
    },
    include: { campaign: { select: { title: true } } },
  });

  // Audience targeting (previously banners ignored this).
  const targeted = viewer
    ? allAds.filter((a) => matchesTargeting(a.targeting, viewer))
    : allAds;

  if (targeted.length === 0) {
    return NextResponse.json({ ad: null });
  }

  // Prefer ads not just shown; fall back to the full set if all are excluded.
  const fresh = targeted.filter((a) => !exclude.has(a.id));
  const ads = fresh.length > 0 ? fresh : targeted;

  // Weighted pick
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

  // Increment impression counter (fire-and-forget) — both the lifetime counter
  // and the daily rollup, so Analytics' time-series matches the lifetime totals
  // (feed ads already write AdDailyStat; banners previously did not).
  prisma.ad
    .update({
      where: { id: chosen.id },
      data: { impressions: { increment: 1 } },
    })
    .catch(() => {});
  void bumpAdDailyStat(chosen.id, { impressions: 1 });

  // Rotation interval delivered so the client can auto-rotate creatives (only
  // meaningful when poolSize > 1). The space's own `rotationSeconds` wins; when
  // unset it falls back to the global `ads.rotation_seconds` admin setting.
  const rotateSecondsRaw =
    placementRow.rotationSeconds ??
    (await getSetting<number>("ads.rotation_seconds", 12));
  const rotateSeconds = Math.min(
    60,
    Math.max(5, Number(rotateSecondsRaw) || 12)
  );

  // Interstitial ad duration (per-space, admin-set; default 5s) — how long the
  // full-screen overlay shows before it can be closed.
  const interstitialSeconds = Math.min(
    60,
    Math.max(3, placementRow.interstitialSeconds ?? 5)
  );

  return NextResponse.json({
    poolSize: targeted.length,
    rotateMs: rotateSeconds * 1000,
    interstitialSeconds,
    ad: {
      id: chosen.id,
      type: chosen.type,
      imageUrl: chosen.contentUrl ?? undefined,
      videoUrl: chosen.videoUrl ?? undefined,
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
  });
}
