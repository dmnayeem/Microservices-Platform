import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { refundCampaignBudgetToCredit } from "@/lib/ad-credits";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
  if (body.budget !== undefined) data.budget = Number(body.budget) || 0;
  if (body.status !== undefined && ["ACTIVE", "PAUSED", "ENDED"].includes(body.status))
    data.status = body.status;
  const parseDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  };
  if (body.startAt !== undefined) data.startAt = parseDate(body.startAt);
  if (body.endAt !== undefined) data.endAt = parseDate(body.endAt);
  const campaign = await prisma.adCampaign.update({ where: { id }, data });

  // Ending a campaign returns its unspent budget to the owner's ad credit. This
  // moves money, so a failure must surface rather than be swallowed.
  let refunded = 0;
  if (data.status === "ENDED") {
    refunded = await refundCampaignBudgetToCredit(id);
  }

  await writeAudit({
    actorId: session.user.id,
    action: data.status === "ENDED" ? "AD_CAMPAIGN_ENDED" : "AD_CAMPAIGN_UPDATED",
    entity: "AdCampaign",
    entityId: id,
    targetUserId: campaign.advertiserId,
    summary:
      data.status === "ENDED"
        ? `Ended campaign "${campaign.title}"${refunded ? ` — refunded $${refunded.toFixed(2)}` : ""}`
        : `Updated campaign "${campaign.title}"`,
    meta: { fields: Object.keys(data), refunded },
  });

  return NextResponse.json({ campaign, refunded });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.adCampaign.findUnique({
    where: { id },
    select: { title: true, advertiserId: true },
  });
  // Return unspent budget to the owner's ad credit BEFORE deleting — once the
  // row is gone the money is unrecoverable, so this must not be fire-and-forget.
  const refunded = await refundCampaignBudgetToCredit(id);
  await prisma.adCampaign.delete({ where: { id } }); // cascades to its ads

  await writeAudit({
    actorId: session.user.id,
    action: "AD_CAMPAIGN_DELETED",
    entity: "AdCampaign",
    entityId: id,
    targetUserId: existing?.advertiserId ?? null,
    summary: `Deleted campaign "${existing?.title ?? id}"${refunded ? ` — refunded $${refunded.toFixed(2)}` : ""}`,
    meta: { refunded },
  });

  return NextResponse.json({ success: true, refunded });
}
