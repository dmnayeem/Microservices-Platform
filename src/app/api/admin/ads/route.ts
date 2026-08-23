import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeTargeting, type AdTargeting } from "@/lib/ad-targeting";
import { clampRewardCooldown } from "@/lib/ad-billing";

const AD_TYPES = ["LOCAL", "HTML", "ADSENSE", "GAM"];
const AD_STATUSES = ["ACTIVE", "INACTIVE", "PAUSED"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Server-side filtering: the list is capped, so without these an older ad was
  // simply unreachable from the admin once the platform had enough newer ones.
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "";
  const placement = sp.get("placement") ?? "";
  const campaignId = sp.get("campaignId") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 500);

  const where: Prisma.AdWhereInput = {
    ...(status ? { status } : {}),
    ...(placement ? { placement: { name: placement } } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(q
      ? {
          OR: [
            { headline: { contains: q, mode: "insensitive" } },
            { brandName: { contains: q, mode: "insensitive" } },
            { targetUrl: { contains: q, mode: "insensitive" } },
            { campaign: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const ads = await prisma.ad.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
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
    allowSameOrigin: Boolean(body.allowSameOrigin),
    size: body.size ? String(body.size) : "responsive",
    width: Number.isFinite(Number(body.width)) && Number(body.width) > 0 ? Math.round(Number(body.width)) : null,
    height: Number.isFinite(Number(body.height)) && Number(body.height) > 0 ? Math.round(Number(body.height)) : null,
    weight: Number.isFinite(Number(body.weight)) ? Math.max(1, Number(body.weight)) : 10,
    // Admin-created ads are auto-approved (admin IS the reviewer) — stamping
    // approvedAt/reviewedBy here is what later lets them be paused and resumed.
    status: AD_STATUSES.includes(body.status) ? body.status : "ACTIVE",
    submittedById: session.user.id,
    submittedAt: new Date(),
    reviewedById: session.user.id,
    reviewedAt: new Date(),
    approvedAt: new Date(),
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
    rewardCooldownSec: clampRewardCooldown(body.rewardCooldownSec),
    watchSeconds: Math.max(1, Number(body.watchSeconds) || 15),
  };

  // One id per submit so the review console can group a multi-space creative.
  const creativeGroupId = randomUUID();
  const created = await prisma.$transaction(
    placementIds.map((placementId) =>
      prisma.ad.create({ data: { ...shared, placementId, creativeGroupId } })
    )
  );

  await writeAudit({
    actorId: session.user.id,
    action: "AD_CREATED",
    entity: "Ad",
    entityId: created[0]?.id ?? null,
    summary: `Created ${created.length} ad${created.length > 1 ? "s" : ""}`,
    meta: { count: created.length, campaignId: shared.campaignId, creativeGroupId },
  });

  return NextResponse.json({ ads: created, count: created.length });
}
