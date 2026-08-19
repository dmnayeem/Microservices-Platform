import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { writeAudit } from "@/lib/audit";
import { add, toNum } from "@/lib/money";
import { AD_PLACEMENTS, placementSizeKey } from "@/lib/ad-placements";

const PLACEMENT_LABEL_BY_NAME: Record<string, string> = Object.fromEntries(
  AD_PLACEMENTS.map((p) => [p.name, p.label])
);

async function ownCampaign(id: string, userId: string) {
  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.advertiserId !== userId) return null;
  return campaign;
}

// GET /api/advertiser/campaigns/[id] — campaign + its ads + aggregated stats.
// Owner-gated: only the advertiser who owns the campaign can view it.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const campaign = await ownCampaign(id, session.user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adsRaw = await prisma.ad.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    include: {
      placement: { select: { name: true } },
      promotedPost: { select: { id: true, content: true, images: true } },
    },
  });
  // Prisma Accelerate under-infers `include` results → cast to the known shape.
  const ads = adsRaw as unknown as Array<{
    id: string;
    format: string;
    status: string;
    placement: { name: string } | null;
    brandName: string | null;
    brandLogo: string | null;
    headline: string | null;
    contentUrl: string | null;
    videoUrl: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
    targeting: unknown;
    weight: number;
    size: string | null;
    impressions: number;
    clicks: number;
    submittedAt: Date | null;
    approvedAt: Date | null;
    reviewedAt: Date | null;
    rejectionReason: string | null;
    rejectionCodes: string[];
    creativeGroupId: string | null;
    promotedPost: { id: string; content: string; images: string[] } | null;
    createdAt: Date;
  }>;

  const totals = ads.reduce(
    (acc, a) => {
      acc.impressions += a.impressions;
      acc.clicks += a.clicks;
      return acc;
    },
    { impressions: 0, clicks: 0 }
  );
  // Authoritative lifetime spend. Deriving it as clicks × CURRENT cpc rewrote
  // history every time an admin changed the CPC.
  const spent = toNum(campaign.spentTotal);

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      remaining: toNum(campaign.budget),
      spent,
      budget: add(campaign.budget, spent).toNumber(),
      startAt: campaign.startAt?.toISOString() ?? null,
      endAt: campaign.endAt?.toISOString() ?? null,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      createdAt: campaign.createdAt.toISOString(),
    },
    ads: ads.map((a) => ({
      id: a.id,
      format: a.format,
      placement: a.placement?.name ?? null,
      placementLabel: a.placement
        ? PLACEMENT_LABEL_BY_NAME[a.placement.name] ?? a.placement.name
        : null,
      status: a.status,
      brandName: a.brandName,
      brandLogo: a.brandLogo,
      headline: a.headline,
      contentUrl: a.contentUrl,
      videoUrl: a.videoUrl,
      ctaLabel: a.ctaLabel,
      targetUrl: a.targetUrl,
      targeting: a.targeting,
      weight: a.weight,
      size: a.size ?? (a.placement ? placementSizeKey(a.placement.name) : null),
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      // Review state — without these the advertiser could never see WHY an ad
      // was turned down, only that it was.
      submittedAt: a.submittedAt?.toISOString() ?? null,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      rejectionReason: a.rejectionReason,
      rejectionCodes: a.rejectionCodes ?? [],
      creativeGroupId: a.creativeGroupId,
      promotedPost: a.promotedPost
        ? {
            id: a.promotedPost.id,
            content: a.promotedPost.content,
            image: a.promotedPost.images?.[0] ?? null,
          }
        : null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

const patchSchema = z
  .object({
    title: z.string().min(2).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    startAt: z.string().datetime().optional().nullable(),
    endAt: z.string().datetime().optional().nullable(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  })
  .strict();

// PATCH /api/advertiser/campaigns/[id] — the advertiser's own controls. Before
// this route existed there was no way to pause or reschedule your own campaign;
// only an admin could touch it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return NextResponse.json(
      { error: "The advertiser is disabled for your plan" },
      { status: 403 }
    );
  }
  const { id } = await params;
  const campaign = await ownCampaign(id, session.user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "ENDED") {
    return NextResponse.json(
      { error: "This campaign has ended and can't be changed." },
      { status: 409 }
    );
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.description !== undefined) data.description = d.description || null;
  if (d.startAt !== undefined) data.startAt = d.startAt ? new Date(d.startAt) : null;
  if (d.endAt !== undefined) data.endAt = d.endAt ? new Date(d.endAt) : null;
  if (d.status !== undefined) data.status = d.status;

  const updated = await prisma.adCampaign.update({ where: { id }, data });
  await writeAudit({
    actorId: session.user.id,
    action: "AD_CAMPAIGN_UPDATED",
    entity: "AdCampaign",
    entityId: id,
    targetUserId: session.user.id,
    summary: `Advertiser updated campaign "${updated.title}"`,
    meta: { fields: Object.keys(data) },
  });

  return NextResponse.json({ success: true, status: updated.status });
}
