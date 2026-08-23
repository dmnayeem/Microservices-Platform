import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeTargeting, type AdTargeting } from "@/lib/ad-targeting";
import { clampRewardCooldown } from "@/lib/ad-billing";
import { AdReviewError, adminSetStatus, materialChanges } from "@/lib/ad-review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AD_TYPES = ["LOCAL", "HTML", "ADSENSE", "GAM"];

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.ad.findUnique({
    where: { id },
    include: { campaign: { select: { title: true, advertiserId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.campaignId) data.campaignId = String(body.campaignId);
  if (body.placementId) data.placementId = String(body.placementId);
  if (body.type && AD_TYPES.includes(body.type)) data.type = body.type;
  if (body.format !== undefined) data.format = String(body.format || "BANNER");
  if (body.contentUrl !== undefined) data.contentUrl = body.contentUrl ? String(body.contentUrl) : null;
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl ? String(body.videoUrl) : null;
  if (body.targetUrl !== undefined) data.targetUrl = body.targetUrl ? String(body.targetUrl) : null;
  if (body.htmlContent !== undefined) data.htmlContent = body.htmlContent ? String(body.htmlContent) : null;
  if (body.adSlot !== undefined) data.adSlot = body.adSlot ? String(body.adSlot) : null;
  if (body.adUnitPath !== undefined) data.adUnitPath = body.adUnitPath ? String(body.adUnitPath) : null;
  if (body.adClient !== undefined) data.adClient = body.adClient ? String(body.adClient) : null;
  if (body.impressionPixel !== undefined) data.impressionPixel = body.impressionPixel ? String(body.impressionPixel) : null;
  if (body.clickTracker !== undefined) data.clickTracker = body.clickTracker ? String(body.clickTracker) : null;
  if (body.allowSameOrigin !== undefined) data.allowSameOrigin = Boolean(body.allowSameOrigin);
  if (body.size !== undefined) data.size = body.size ? String(body.size) : "responsive";
  if (body.width !== undefined)
    data.width = Number.isFinite(Number(body.width)) && Number(body.width) > 0 ? Math.round(Number(body.width)) : null;
  if (body.height !== undefined)
    data.height = Number.isFinite(Number(body.height)) && Number(body.height) > 0 ? Math.round(Number(body.height)) : null;
  if (body.weight !== undefined) data.weight = Math.max(1, Number(body.weight) || 10);
  if (body.rewardPoints !== undefined) data.rewardPoints = Math.max(0, Number(body.rewardPoints) || 0);
  if (body.rewardCooldownSec !== undefined)
    data.rewardCooldownSec = clampRewardCooldown(body.rewardCooldownSec);
  if (body.watchSeconds !== undefined) data.watchSeconds = Math.max(1, Number(body.watchSeconds) || 15);
  if (body.headline !== undefined) data.headline = body.headline ? String(body.headline) : null;
  if (body.brandName !== undefined) data.brandName = body.brandName ? String(body.brandName) : null;
  if (body.brandLogo !== undefined) data.brandLogo = body.brandLogo ? String(body.brandLogo) : null;
  if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel ? String(body.ctaLabel) : null;
  if (body.promotedPostId !== undefined)
    data.promotedPostId = body.promotedPostId ? String(body.promotedPostId) : null;
  if (body.targeting !== undefined) {
    data.targeting =
      (normalizeTargeting((body.targeting ?? {}) as AdTargeting) as
        | Prisma.InputJsonValue
        | null) ?? Prisma.JsonNull;
  }

  const changed = materialChanges(existing as unknown as Record<string, unknown>, data);

  // `status` never rides along on a field edit: it belongs to the review state
  // machine, so an edit can't silently approve an ad that was never reviewed.
  let ad = existing;
  if (Object.keys(data).length > 0) {
    ad = await prisma.ad.update({
      where: { id },
      data: data as Prisma.AdUncheckedUpdateInput,
      include: { campaign: { select: { title: true, advertiserId: true } } },
    });
    await writeAudit({
      actorId: session.user.id,
      action: "AD_UPDATED",
      entity: "Ad",
      entityId: id,
      targetUserId: existing.submittedById ?? existing.campaign.advertiserId,
      summary: `Edited an ad in "${existing.campaign.title}"${changed.length ? ` (${changed.join(", ")})` : ""}`,
      meta: { campaign: existing.campaign.title, fields: Object.keys(data) },
    });
  }

  if (typeof body.status === "string" && body.status !== existing.status) {
    try {
      await adminSetStatus({ adId: id, actorId: session.user.id, status: body.status });
    } catch (e) {
      if (e instanceof AdReviewError) {
        return NextResponse.json(
          { error: e.message, code: e.code, ad },
          { status: e.status }
        );
      }
      throw e;
    }
    ad = (await prisma.ad.findUnique({
      where: { id },
      include: { campaign: { select: { title: true, advertiserId: true } } },
    }))!;
  }

  return NextResponse.json({ ad });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.ad.findUnique({
    where: { id },
    select: {
      submittedById: true,
      campaign: { select: { title: true, advertiserId: true } },
    },
  });
  await prisma.ad.delete({ where: { id } });
  if (existing) {
    await writeAudit({
      actorId: session.user.id,
      action: "AD_DELETED",
      entity: "Ad",
      entityId: id,
      targetUserId: existing.submittedById ?? existing.campaign.advertiserId,
      summary: `Deleted an ad in "${existing.campaign.title}"`,
      meta: { campaign: existing.campaign.title },
    });
  }
  return NextResponse.json({ success: true });
}
