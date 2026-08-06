import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/ads/[id]/reject — reject an ad (won't serve) with a reason,
// and notify the advertiser.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim().slice(0, 500) || "Not approved.";

  const ad = await prisma.ad.findUnique({
    where: { id },
    include: { campaign: { select: { title: true, advertiserId: true } } },
  });
  if (!ad) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }

  const updated = await prisma.ad.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });

  const advertiserId = ad.submittedById ?? ad.campaign.advertiserId;
  if (advertiserId) {
    await notifyUser({
      userId: advertiserId,
      type: NotificationType.SYSTEM,
      title: "Ad rejected",
      message: `Your ad in "${ad.campaign.title}" was rejected: ${reason}`,
      link: "/advertiser",
    }).catch(() => {});
  }

  return NextResponse.json({ ad: updated });
}
