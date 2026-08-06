import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  type: z.enum([
    "XP_MULTIPLIER",
    "BONUS_POINTS",
    "FREE_TICKETS",
    "DISCOUNT",
    "REFERRAL_BOOST",
    "SEASONAL",
  ]),
  value: z.number().min(0).default(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetType: z.enum(["ALL", "TIER", "NEW_USERS", "COUNTRY"]).default("ALL"),
  targetValue: z.string().optional().nullable(),
  budget: z.number().min(0).optional().nullable(),
  bannerImage: z.string().url().optional().nullable().or(z.literal("")),
  termsAndConditions: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "ACTIVE", "PAUSED", "ENDED"]).default("SCHEDULED"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "campaigns.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const data = v.data;
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
