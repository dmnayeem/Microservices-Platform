import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { AdReviewError, resubmitAd } from "@/lib/ad-review";

// POST /api/advertiser/ads/[id]/resubmit — send a REJECTED / CHANGES_REQUESTED
// ad back into the review queue. Editing already re-queues an ad; this is the
// "nothing left to change, please look again" path.
export async function POST(
  _req: NextRequest,
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
  const ad = await prisma.ad.findUnique({
    where: { id },
    select: { id: true, campaign: { select: { advertiserId: true } } },
  });
  if (!ad || ad.campaign?.advertiserId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await resubmitAd({ adId: id, userId: session.user.id });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof AdReviewError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
