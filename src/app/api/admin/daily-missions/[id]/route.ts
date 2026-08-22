import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { tierToAccessLevel } from "@/lib/package-tiers";
import { z } from "zod";
import { MISSION_TASK_TYPES } from "@/lib/mission-labels";
import { sanitizeTaskAudience, hasAudienceKeys } from "@/lib/task-targeting";

const itemSchema = z.object({
  id: z.string().optional(),
  // One definition, in src/lib/mission-labels.ts. Both admin routes used to
  // carry their own copy of this list.
  taskType: z.enum(MISSION_TASK_TYPES),
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
  completionCashReward: z.number().min(0).default(0),
  streakBonusEvery: z.number().int().min(0).max(365).default(0),
  streakBonusPoints: z.number().int().min(0).default(0),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
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
  const { items, packageTier, startAt, endAt, ...rest } = v.data;
  const data = {
    ...rest,
    ...(startAt !== undefined ? { startAt: startAt ? new Date(startAt) : null } : {}),
    ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
    // Replace targeting wholesale or not at all — see hasAudienceKeys.
    ...(hasAudienceKeys(body) ? sanitizeTaskAudience(body) : {}),
    ...(packageTier !== undefined
      ? { requiredAccessLevel: tierToAccessLevel(packageTier) }
      : {}),
  };

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
