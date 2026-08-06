import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeTargeting, type AdTargeting } from "@/lib/ad-targeting";

const AD_TYPES = ["LOCAL", "HTML", "ADSENSE", "GAM"];
const AD_STATUSES = ["ACTIVE", "INACTIVE", "PAUSED"];

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ads = await prisma.ad.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          status: true,
          budget: true,
          startAt: true,
          endAt: true,
          advertiser: { select: { id: true, name: true, username: true } },
        },
      },
      placement: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ ads });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  // Multi-space: `placementIds` (Facebook-style, one creative across many spaces)
  // with back-compat for the single `placementId`.
  const placementIds: string[] = Array.isArray(body.placementIds)
    ? body.placementIds.map(String).filter(Boolean)
    : body.placementId
    ? [String(body.placementId)]
    : [];
  if (!body.campaignId || placementIds.length === 0) {
    return NextResponse.json(
      { error: "Campaign and at least one placement are required" },
      { status: 400 }
    );
  }

  // Shared creative/targeting for every placement row.
  const shared = {
    campaignId: String(body.campaignId),
    type: AD_TYPES.includes(body.type) ? body.type : "LOCAL",
    format: body.format ? String(body.format) : "BANNER",
    contentUrl: body.contentUrl ? String(body.contentUrl) : null,
    videoUrl: body.videoUrl ? String(body.videoUrl) : null,
    targetUrl: body.targetUrl ? String(body.targetUrl) : null,
    htmlContent: body.htmlContent ? String(body.htmlContent) : null,
    // Network (ADSENSE/GAM) config + optional tracking pixels.
    adSlot: body.adSlot ? String(body.adSlot) : null,
    adUnitPath: body.adUnitPath ? String(body.adUnitPath) : null,
    adClient: body.adClient ? String(body.adClient) : null,
    impressionPixel: body.impressionPixel ? String(body.impressionPixel) : null,
    clickTracker: body.clickTracker ? String(body.clickTracker) : null,
    size: body.size ? String(body.size) : "responsive",
    width: Number.isFinite(Number(body.width)) && Number(body.width) > 0 ? Math.round(Number(body.width)) : null,
    height: Number.isFinite(Number(body.height)) && Number(body.height) > 0 ? Math.round(Number(body.height)) : null,
    weight: Number.isFinite(Number(body.weight)) ? Math.max(1, Number(body.weight)) : 10,
    // Admin-created ads are auto-approved (admin IS the reviewer).
    status: AD_STATUSES.includes(body.status) ? body.status : "ACTIVE",
    headline: body.headline ? String(body.headline) : null,
    brandName: body.brandName ? String(body.brandName) : null,
    brandLogo: body.brandLogo ? String(body.brandLogo) : null,
    ctaLabel: body.ctaLabel ? String(body.ctaLabel) : null,
    promotedPostId: body.promotedPostId ? String(body.promotedPostId) : null,
    targeting:
      (normalizeTargeting((body.targeting ?? {}) as AdTargeting) as
        | Prisma.InputJsonValue
        | null) ?? Prisma.JsonNull,
    rewardPoints: Math.max(0, Number(body.rewardPoints) || 0),
    rewardCooldownSec: Math.max(0, Number(body.rewardCooldownSec) || 3600),
    watchSeconds: Math.max(1, Number(body.watchSeconds) || 15),
  };

  const created = await prisma.$transaction(
    placementIds.map((placementId) =>
      prisma.ad.create({ data: { ...shared, placementId } })
    )
  );
  return NextResponse.json({ ads: created, count: created.length });
}
