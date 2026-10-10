import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { CAMPAIGNS_TAG, EFFECT_TYPES, clampCampaignValue } from "@/lib/campaigns";
import { campaignSchema } from "@/lib/campaigns-shared";

// PATCH /api/admin/campaigns/:id — edit any field, or pause / resume / end.
// DELETE /api/admin/campaigns/:id
// Campaigns could only be created before; nothing could be changed.

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await can(session.user.id, "campaigns.manage"))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const v = campaignSchema.partial().safeParse(await request.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  const d = v.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description || null;
  if (d.type !== undefined) data.type = d.type;
  if (d.value !== undefined) data.value = d.value;
  if (d.startDate !== undefined) data.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) data.endDate = new Date(d.endDate);
  if (d.targetType !== undefined) data.targetType = d.targetType;
  if (d.targetValue !== undefined) data.targetValue = d.targetValue || null;
  if (d.budget !== undefined) data.budget = d.budget ?? null;
  if (d.bannerImage !== undefined) data.bannerImage = d.bannerImage || null;
  if (d.termsAndConditions !== undefined) data.termsAndConditions = d.termsAndConditions ?? null;
  if (d.status !== undefined) data.status = d.status;

  const type = (data.type as string | undefined) ?? existing.type;
  if ((EFFECT_TYPES as readonly string[]).includes(type) && data.value !== undefined) {
    data.value = clampCampaignValue(data.value);
  }
  const start = (data.startDate as Date | undefined) ?? existing.startDate;
  const end = (data.endDate as Date | undefined) ?? existing.endDate;
  if (end <= start) return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 });

  const campaign = await prisma.campaign.update({ where: { id }, data });
  revalidateTag(CAMPAIGNS_TAG, "max");
  await writeAudit({
    actorId: g.userId,
    action: "CAMPAIGN_UPDATED",
    entity: "Campaign",
    entityId: id,
    summary:
      Object.keys(data).length === 1 && data.status
        ? `Campaign "${campaign.title}" → ${campaign.status}`
        : `Edited campaign "${campaign.title}"`,
    meta: { before: { status: existing.status, value: existing.value, type: existing.type }, changed: Object.keys(data) },
  });
  return NextResponse.json({
    success: true,
    campaign: { ...campaign, budget: campaign.budget == null ? null : Number(campaign.budget), rewardsDistributed: Number(campaign.rewardsDistributed) },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { title: true } });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  await prisma.campaign.delete({ where: { id } });
  revalidateTag(CAMPAIGNS_TAG, "max");
  await writeAudit({
    actorId: g.userId,
    action: "CAMPAIGN_DELETED",
    entity: "Campaign",
    entityId: id,
    summary: `Deleted campaign "${existing.title}"`,
  });
  return NextResponse.json({ success: true });
}
