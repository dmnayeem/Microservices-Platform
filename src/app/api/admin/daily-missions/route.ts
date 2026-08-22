import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { tierToAccessLevel } from "@/lib/package-tiers";
import { z } from "zod";
import { MISSION_TASK_TYPES } from "@/lib/mission-labels";
import { sanitizeTaskAudience } from "@/lib/task-targeting";

const itemSchema = z.object({
  // One definition, in src/lib/mission-labels.ts. Both admin routes used to
  // carry their own copy of this list.
  taskType: z.enum(MISSION_TASK_TYPES),
  description: z.string().max(300).nullable().optional(),
  targetCount: z.number().int().min(1).max(1000).default(1),
  xpPerComplete: z.number().int().min(0).default(0),
  pointsPerComplete: z.number().int().min(0).default(0),
  duration: z.number().int().min(0).nullable().optional(),
  requiredLevel: z.number().int().min(0).nullable().optional(),
  order: z.number().int().default(0),
});

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  packageTier: z.enum(["FREE", "STARTER", "PRO", "ELITE", "VIP"]).default("FREE"),
  requiredLevel: z.number().int().min(0).default(1),
  completionXpReward: z.number().int().min(0).default(0),
  completionPointsReward: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  autoRefresh: z.boolean().default(true),
  linkReferralBonus: z.boolean().default(false),
  completionCashReward: z.number().min(0).default(0),
  streakBonusEvery: z.number().int().min(0).max(365).default(0),
  streakBonusPoints: z.number().int().min(0).default(0),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  order: z.number().int().default(0),
  items: z.array(itemSchema).min(1, "Add at least one task item"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "missions.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const missions = await prisma.dailyMissionTemplate.findMany({
    orderBy: [{ requiredAccessLevel: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    include: {
      items: { orderBy: { order: "asc" } },
      _count: { select: { claims: true } },
    },
  });

  return NextResponse.json({ missions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  // `packageTier` is the admin-facing enum; the model stores `requiredAccessLevel`.
  const { items, packageTier, startAt, endAt, ...mission } = v.data;
  const created = await prisma.dailyMissionTemplate.create({
    data: {
      ...mission,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      ...sanitizeTaskAudience(body),
      requiredAccessLevel: tierToAccessLevel(packageTier),
      createdById: session.user.id,
      items: {
        create: items.map((it, idx) => ({
          ...it,
          order: it.order || idx,
        })),
      },
    },
    include: { items: { orderBy: { order: "asc" } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "DAILY_MISSION_CREATED",
      entity: "DailyMissionTemplate",
      entityId: created.id,
      newData: { name: created.name, requiredAccessLevel: created.requiredAccessLevel, items: items.length },
    },
  });

  return NextResponse.json({ mission: created }, { status: 201 });
}
