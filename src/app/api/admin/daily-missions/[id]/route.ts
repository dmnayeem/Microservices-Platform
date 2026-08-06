import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { tierToAccessLevel } from "@/lib/missions";
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().optional(),
  taskType: z.enum([
    "ARTICLE",
    "VIDEO",
    "QUIZ",
    "SURVEY",
    "SOCIAL",
    "PROXY",
    "OFFERWALL",
    "BOARD",
    "MANUAL",
    "CUSTOM",
    "SOCIAL_LIKE",
    "SOCIAL_COMMENT",
    "SOCIAL_POST",
    "SOCIAL_SHARE",
    "SOCIAL_VOTE",
  ]),
  description: z.string().max(300).nullable().optional(),
  targetCount: z.number().int().min(1).max(1000),
  xpPerComplete: z.number().int().min(0),
  pointsPerComplete: z.number().int().min(0),
  duration: z.number().int().min(0).nullable().optional(),
  requiredLevel: z.number().int().min(0).nullable().optional(),
  order: z.number().int(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  packageTier: z.enum(["FREE", "STARTER", "PRO", "ELITE", "VIP"]).optional(),
  requiredLevel: z.number().int().min(0).optional(),
  completionXpReward: z.number().int().min(0).optional(),
  completionPointsReward: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  autoRefresh: z.boolean().optional(),
  linkReferralBonus: z.boolean().optional(),
  order: z.number().int().optional(),
  items: z.array(itemSchema).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "missions.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const mission = await prisma.dailyMissionTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!mission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ mission });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.dailyMissionTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `packageTier` is the admin-facing enum; the model stores `requiredAccessLevel`.
  const { items, packageTier, ...rest } = v.data;
  const data =
    packageTier !== undefined
      ? { ...rest, requiredAccessLevel: tierToAccessLevel(packageTier) }
      : rest;

  const mission = await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyMissionTemplate.update({
      where: { id },
      data,
    });
    if (items) {
      // Replace items: delete-all then re-create. Simple and correct given small N.
      await tx.dailyMissionItem.deleteMany({ where: { missionId: id } });
      if (items.length > 0) {
        await tx.dailyMissionItem.createMany({
          data: items.map((it, idx) => ({
            missionId: id,
            taskType: it.taskType,
            description: it.description ?? null,
            targetCount: it.targetCount,
            xpPerComplete: it.xpPerComplete,
            pointsPerComplete: it.pointsPerComplete,
            duration: it.duration ?? null,
            requiredLevel: it.requiredLevel ?? null,
            order: it.order || idx,
          })),
        });
      }
    }
    return updated;
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "DAILY_MISSION_UPDATED",
      entity: "DailyMissionTemplate",
      entityId: id,
      newData: { ...rest, itemsUpdated: items?.length ?? 0 },
    },
  });

  return NextResponse.json({ mission });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.dailyMissionTemplate.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "DAILY_MISSION_DELETED",
      entity: "DailyMissionTemplate",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
