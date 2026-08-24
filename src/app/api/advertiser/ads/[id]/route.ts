import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAdFitsPlacement, placementLabel } from "@/lib/ad-placements";
import { userCanFeature } from "@/lib/packages";
import { normalizeTargeting } from "@/lib/ad-targeting";
import { adTargetingSchema } from "@/lib/ad-targeting-schema";
import { AdReviewError, applyAdvertiserEdit } from "@/lib/ad-review";

/** Load an ad and confirm the session user owns its campaign. */
async function ownAd(adId: string, userId: string) {
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: { campaign: { select: { advertiserId: true } } },
  });
  if (!ad || ad.campaign?.advertiserId !== userId) return null;
  return ad;
}

async function gate(adId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // Losing advertiser access must stop edits too, not just new campaigns.
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return {
      error: NextResponse.json(
        { error: "The advertiser is disabled for your plan" },
        { status: 403 }
      ),
    };
  }
  const ad = await ownAd(adId, session.user.id);
  if (!ad) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { userId: session.user.id, ad };
}

// The full creative an advertiser owns. `type`, `htmlContent` and the ad-network
// fields are deliberately absent: raw advertiser HTML is same-origin script
// execution, so it stays an admin-only capability.
const patchSchema = z
  .object({
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    // Clamped — see the note in campaigns/[id]/ads/route.ts.
    weight: z.number().int().min(1).max(20).optional(),
    format: z.enum(["NATIVE", "BANNER"]).optional(),
    size: z.string().max(40).optional().nullable(),
    width: z.number().int().min(1).max(4000).optional().nullable(),
    height: z.number().int().min(1).max(4000).optional().nullable(),
    brandName: z.string().max(60).optional().nullable(),
    brandLogo: z.string().max(2048).optional().nullable(),
    headline: z.string().max(500).optional().nullable(),
    contentUrl: z.string().max(2048).optional().nullable(),
    videoUrl: z.string().max(2048).optional().nullable(),
    ctaLabel: z.string().max(30).optional().nullable(),
    targetUrl: z.string().url().optional().nullable(),
    targeting: adTargetingSchema,
  })
  .strict();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;
  const ad = g.ad;

  const placement = await prisma.adPlacement.findUnique({
    where: { id: ad.placementId },
    select: { name: true },
  });

  return NextResponse.json({
    ad: {
      id: ad.id,
      campaignId: ad.campaignId,
      placementId: ad.placementId,
      placement: placement?.name ?? null,
      format: ad.format,
      status: ad.status,
      brandName: ad.brandName,
      brandLogo: ad.brandLogo,
      headline: ad.headline,
      contentUrl: ad.contentUrl,
      videoUrl: ad.videoUrl,
      ctaLabel: ad.ctaLabel,
      targetUrl: ad.targetUrl,
      promotedPostId: ad.promotedPostId,
      targeting: ad.targeting,
      weight: ad.weight,
      size: ad.size,
      width: ad.width,
      height: ad.height,
      submittedAt: ad.submittedAt,
      approvedAt: ad.approvedAt,
      reviewedAt: ad.reviewedAt,
      rejectionReason: ad.rejectionReason,
      rejectionCodes: ad.rejectionCodes,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // Same fit rule as create — an advertiser can resize an already-approved ad,
  // and size changes deliberately skip re-review.
  if (d.size !== undefined || d.width !== undefined || d.height !== undefined) {
    const current = g.ad;
    const target = await prisma.adPlacement.findUnique({
      where: { id: current.placementId },
      select: { name: true },
    });
    if (target) {
      const problems = checkAdFitsPlacement({
        placementName: target.name,
        placementLabel: placementLabel(target.name),
        size: d.size ?? current.size,
        width: d.width ?? current.width,
        height: d.height ?? current.height,
        type: current.type,
      });
      if (problems.length > 0) {
        return NextResponse.json(
          { error: problems[0].message, problems },
          { status: 400 }
        );
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (d.status !== undefined) patch.status = d.status;
  if (d.weight !== undefined) patch.weight = d.weight;
  if (d.format !== undefined) patch.format = d.format;
  if (d.size !== undefined) patch.size = d.size || "responsive";
  if (d.width !== undefined) patch.width = d.width ?? null;
  if (d.height !== undefined) patch.height = d.height ?? null;
  if (d.brandName !== undefined) patch.brandName = d.brandName || null;
  if (d.brandLogo !== undefined) patch.brandLogo = d.brandLogo || null;
  if (d.headline !== undefined) patch.headline = d.headline || null;
  if (d.contentUrl !== undefined) patch.contentUrl = d.contentUrl || null;
  if (d.videoUrl !== undefined) patch.videoUrl = d.videoUrl || null;
  if (d.ctaLabel !== undefined) patch.ctaLabel = d.ctaLabel || null;
  if (d.targetUrl !== undefined) patch.targetUrl = d.targetUrl || null;
  if (d.targeting !== undefined) {
    patch.targeting =
      (normalizeTargeting(d.targeting ?? {}) as Prisma.InputJsonValue | null) ??
      Prisma.JsonNull;
  }

  try {
    // ad-review.ts owns the status column: it decides whether this edit is
    // material (→ back to PENDING, stops serving) and refuses any status change
    // the advertiser isn't allowed to make.
    const result = await applyAdvertiserEdit({
      adId: id,
      userId: g.userId,
      patch,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof AdReviewError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await gate(id);
  if (g.error) return g.error;
  await prisma.ad.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
