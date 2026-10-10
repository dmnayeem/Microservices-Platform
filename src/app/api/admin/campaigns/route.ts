import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { revalidateTag } from "next/cache";
import { CAMPAIGNS_TAG, EFFECT_TYPES, clampCampaignValue } from "@/lib/campaigns";
import { campaignSchema } from "@/lib/campaigns-shared";



export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "campaigns.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = campaignSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const data = v.data;
  if (new Date(data.endDate) <= new Date(data.startDate)) {
    return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 });
  }
  // The boost types are multipliers, capped (lib/campaigns.ts).
  if ((EFFECT_TYPES as readonly string[]).includes(data.type)) data.value = clampCampaignValue(data.value);
  const campaign = await prisma.campaign.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      value: data.value,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      targetType: data.targetType,
      targetValue: data.targetValue ?? null,
      budget: data.budget ?? null,
      bannerImage: data.bannerImage || null,
      termsAndConditions: data.termsAndConditions ?? null,
      status: data.status,
      createdById: session.user.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CAMPAIGN_CREATED",
      entity: "Campaign",
      entityId: campaign.id,
      newData: { title: campaign.title, type: campaign.type },
    },
  });
  revalidateTag(CAMPAIGNS_TAG, "max");
  return NextResponse.json(
    {
      success: true,
      campaign: {
        ...campaign,
        budget: toNumOrNull(campaign.budget),
        rewardsDistributed: toNum(campaign.rewardsDistributed),
      },
    },
    { status: 201 }
  );
}
