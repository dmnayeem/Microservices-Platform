import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { ensureDefaultPlacements } from "@/lib/ad-placements-server";
import { isAdvertiserSelectable, placementSizeKey } from "@/lib/ad-placements";
import { normalizeTargeting } from "@/lib/ad-targeting";
import { adTargetingSchema } from "@/lib/ad-targeting-schema";
import { AD_STATUS, recordSubmission } from "@/lib/ad-review";

const createAdSchema = z.object({
  format: z.enum(["NATIVE", "BANNER"]).default("NATIVE"),
  // Back-compat single placement; `placements` (names) enables multi-space.
  placement: z.string().default("IN_FEED"),
  placements: z.array(z.string()).optional(),
  promotedPostId: z.string().optional().nullable(),
  brandName: z.string().max(60).optional().nullable(),
  brandLogo: z.string().max(2048).optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  contentUrl: z.string().max(2048).optional().nullable(),
  videoUrl: z.string().max(2048).optional().nullable(),
  ctaLabel: z.string().max(30).optional().nullable(),
  targetUrl: z.string().url().optional().nullable(),
  size: z.string().max(40).optional().nullable(),
  width: z.number().int().min(1).max(4000).optional().nullable(),
  height: z.number().int().min(1).max(4000).optional().nullable(),
  // Full audience schema — the old narrow one silently dropped 10 of the 14
  // dimensions the audience builder collects.
  targeting: adTargetingSchema,
  weight: z.number().int().min(1).max(100).default(10),
});

// POST /api/advertiser/campaigns/[id]/ads — create an ad inside a campaign.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withIdempotency(req, session.user.id, async () => {
  if (!(await userCanFeature(session.user.id, "advertiser"))) {
    return NextResponse.json(
      { error: "The advertiser is disabled for your plan" },
      { status: 403 }
    );
  }
  const { id: campaignId } = await params;

  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, advertiserId: true, title: true },
  });
  if (!campaign || campaign.advertiserId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = createAdSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // Promote-a-post: the post must belong to the advertiser.
  if (d.promotedPostId) {
    const post = await prisma.post.findUnique({
      where: { id: d.promotedPostId },
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only promote your own posts." },
        { status: 400 }
      );
    }
  } else if (!d.headline && !d.contentUrl && !d.videoUrl) {
    return NextResponse.json(
      { error: "Add a headline, an image or a video for the ad." },
      { status: 400 }
    );
  }
  if (!d.targetUrl) {
    return NextResponse.json(
      { error: "A destination URL (targetUrl) is required." },
      { status: 400 }
    );
  }

  // Resolve placement(s) by name (ensuring canonical rows exist first).
  await ensureDefaultPlacements();
  const wantedNames = (
    d.placements && d.placements.length > 0 ? d.placements : [d.placement]
  ).filter(isAdvertiserSelectable); // interstitial/CPM inventory is house-only
  if (wantedNames.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one ad space that's available to advertisers." },
      { status: 400 }
    );
  }
  const placements = await prisma.adPlacement.findMany({
    where: { name: { in: wantedNames }, isActive: true },
    select: { id: true, name: true },
  });
  if (placements.length === 0) {
    return NextResponse.json({ error: "Unknown placement" }, { status: 400 });
  }

  const targeting =
    (normalizeTargeting(d.targeting ?? {}) as Prisma.InputJsonValue | null) ??
    Prisma.JsonNull;

  // One id across every row this submit creates, so a reviewer sees (and
  // decides on) the whole submission rather than N unrelated-looking ads.
  const creativeGroupId = randomUUID();
  const submittedAt = new Date();

  // Advertiser-submitted ads await admin approval before serving.
  const created = await prisma.$transaction(
    placements.map((p) =>
      prisma.ad.create({
        data: {
          campaignId,
          placementId: p.id,
          type: "LOCAL",
          format: d.format,
          promotedPostId: d.promotedPostId || null,
          brandName: d.brandName || null,
          brandLogo: d.brandLogo || null,
          headline: d.headline || null,
          contentUrl: d.contentUrl || null,
          videoUrl: d.videoUrl || null,
          ctaLabel: d.ctaLabel || null,
          targetUrl: d.targetUrl,
          size: d.size || placementSizeKey(p.name),
          width: d.width ?? null,
          height: d.height ?? null,
          targeting,
          weight: d.weight,
          status: AD_STATUS.PENDING,
          submittedById: session.user.id,
          submittedAt,
          creativeGroupId,
        },
        select: { id: true },
      })
    )
  );

  await recordSubmission({
    adIds: created.map((c) => c.id),
    userId: session.user.id,
    campaignTitle: campaign.title,
    snapshot: {
      targetUrl: d.targetUrl,
      headline: d.headline,
      contentUrl: d.contentUrl,
      videoUrl: d.videoUrl,
      brandName: d.brandName,
      format: d.format,
      targeting: d.targeting ?? null,
    },
  });

  return NextResponse.json(
    { success: true, count: created.length, pending: true, creativeGroupId },
    { status: 201 }
  );
  });
}
