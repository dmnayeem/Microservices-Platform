import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { ensureDefaultPlacements } from "@/lib/ad-placements-server";
import { normalizeTargeting } from "@/lib/ad-targeting";

const targetingSchema = z
  .object({
    countries: z.array(z.string()).optional(),
    genders: z.array(z.string()).optional(),
    minLevel: z.number().int().min(0).optional(),
    packages: z.array(z.string()).optional(),
  })
  .optional();

const createAdSchema = z.object({
  format: z.enum(["NATIVE", "BANNER"]).default("NATIVE"),
  // Back-compat single placement; `placements` (names) enables multi-space.
  placement: z.string().default("IN_FEED"),
  placements: z.array(z.string()).optional(),
  promotedPostId: z.string().optional().nullable(),
  brandName: z.string().max(60).optional().nullable(),
  brandLogo: z.string().optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  contentUrl: z.string().optional().nullable(),
  ctaLabel: z.string().max(30).optional().nullable(),
  targetUrl: z.string().url().optional().nullable(),
  targeting: targetingSchema,
  weight: z.number().int().min(1).max(100).default(10),
  status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE"),
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
    select: { id: true, advertiserId: true },
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
  } else if (!d.headline && !d.contentUrl) {
    return NextResponse.json(
      { error: "Add a headline or an image for the ad." },
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
  const wantedNames =
    d.placements && d.placements.length > 0 ? d.placements : [d.placement];
  const placements = await prisma.adPlacement.findMany({
    where: { name: { in: wantedNames }, isActive: true },
    select: { id: true },
  });
  if (placements.length === 0) {
    return NextResponse.json({ error: "Unknown placement" }, { status: 400 });
  }

  const targeting =
    (normalizeTargeting(d.targeting ?? {}) as Prisma.InputJsonValue | null) ??
    Prisma.JsonNull;

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
          ctaLabel: d.ctaLabel || null,
          targetUrl: d.targetUrl,
          targeting,
          weight: d.weight,
          status: "PENDING",
          submittedById: session.user.id,
        },
        select: { id: true },
      })
    )
  );

  return NextResponse.json(
    { success: true, count: created.length, pending: true },
    { status: 201 }
  );
  });
}
