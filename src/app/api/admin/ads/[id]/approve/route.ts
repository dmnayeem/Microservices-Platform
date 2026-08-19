import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { normalizeTargeting } from "@/lib/ad-targeting";
import { adTargetingSchema } from "@/lib/ad-targeting-schema";
import { AdReviewError, approveAd } from "@/lib/ad-review";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Fields a reviewer may fix in place while approving ("approve with edits"),
// so a good ad with one bad field doesn't need a rejection round-trip.
const bodySchema = z.object({
  internalNote: z.string().max(2000).optional().nullable(),
  edits: z
    .object({
      targetUrl: z.string().url().optional().nullable(),
      headline: z.string().max(500).optional().nullable(),
      brandName: z.string().max(60).optional().nullable(),
      brandLogo: z.string().max(2048).optional().nullable(),
      contentUrl: z.string().max(2048).optional().nullable(),
      videoUrl: z.string().max(2048).optional().nullable(),
      ctaLabel: z.string().max(30).optional().nullable(),
      format: z.enum(["NATIVE", "BANNER"]).optional(),
      weight: z.number().int().min(1).max(100).optional(),
      rewardPoints: z.number().int().min(0).optional(),
      targeting: adTargetingSchema,
    })
    .optional(),
});

// POST /api/admin/ads/[id]/approve — approve a PENDING (advertiser-submitted) ad
// so it starts serving, optionally fixing fields in the same step.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const raw = parsed.data.edits ?? {};
  const edits: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || k === "targeting") continue;
    edits[k] = v === "" ? null : v;
  }
  if (raw.targeting !== undefined) {
    edits.targeting =
      (normalizeTargeting(raw.targeting ?? {}) as Prisma.InputJsonValue | null) ??
      Prisma.JsonNull;
  }

  try {
    const ad = await approveAd({
      adId: id,
      actorId: session.user.id,
      edits,
      internalNote: parsed.data.internalNote ?? null,
    });
    return NextResponse.json({ ad });
  } catch (e) {
    if (e instanceof AdReviewError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
