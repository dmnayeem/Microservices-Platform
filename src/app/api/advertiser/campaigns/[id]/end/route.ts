import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { withIdempotency } from "@/lib/idempotency";
import { writeAudit } from "@/lib/audit";
import { refundCampaignBudgetToCredit } from "@/lib/ad-credits";

/**
 * POST /api/advertiser/campaigns/[id]/end — stop a campaign and take the unspent
 * budget back as ad credit.
 *
 * There was previously no advertiser route to end a campaign at all, and ad
 * credit isn't withdrawable — so money put into a campaign was unrecoverable
 * without an admin. Ending (not deleting) keeps the ads, their stats and the
 * review history intact for disputes.
 */
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
    const { id } = await params;
    const campaign = await prisma.adCampaign.findUnique({
      where: { id },
      select: { id: true, title: true, advertiserId: true, status: true },
    });
    if (!campaign || campaign.advertiserId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (campaign.status === "ENDED") {
      return NextResponse.json({ success: true, refunded: 0, alreadyEnded: true });
    }

    await prisma.adCampaign.update({ where: { id }, data: { status: "ENDED" } });
    const refunded = await refundCampaignBudgetToCredit(id);

    await writeAudit({
      actorId: session.user.id,
      action: "AD_CAMPAIGN_ENDED",
      entity: "AdCampaign",
      entityId: id,
      targetUserId: session.user.id,
      summary: `Advertiser ended campaign "${campaign.title}"${refunded ? ` — ${usd(refunded)} returned to ad credit` : ""}`,
      meta: { refunded },
    });

    return NextResponse.json({ success: true, refunded });
  });
}
