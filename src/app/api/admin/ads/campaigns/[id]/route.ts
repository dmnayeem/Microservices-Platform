import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
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
  // Ending a campaign returns its unspent budget to the owner's ad credit.
  if (data.status === "ENDED") {
    await refundCampaignBudgetToCredit(id).catch(() => {});
  }
  return NextResponse.json({ campaign });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  // Return unspent budget to the owner's ad credit before deleting.
  await refundCampaignBudgetToCredit(id).catch(() => {});
  await prisma.adCampaign.delete({ where: { id } }); // cascades to its ads
  return NextResponse.json({ success: true });
}
