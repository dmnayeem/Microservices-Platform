import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdReviewError, reopenForReview } from "@/lib/ad-review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({ reason: z.string().max(2000).optional().nullable() });

// POST /api/admin/ads/[id]/reopen — put a decided ad back in the queue. Review
// decisions must be reversible: before this, a wrongly rejected ad could only be
// fixed by the advertiser deleting and recreating it.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));

  try {
    const ad = await reopenForReview({
      adId: id,
      actorId: session.user.id,
      reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    return NextResponse.json({ ad });
  } catch (e) {
    if (e instanceof AdReviewError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
