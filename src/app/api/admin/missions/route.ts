import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  type: z.enum([
    "TASK_COMPLETION",
    "LOGIN_STREAK",
    "REFERRAL",
    "SPEND",
    "EARN",
  ]),
  targetValue: z.number().int().min(1),
  pointsReward: z.number().int().min(0).default(0),
  cashReward: z.number().min(0).default(0),
  xpReward: z.number().int().min(0).default(0),
  duration: z.enum(["DAILY", "WEEKLY"]).default("DAILY"),
  autoRefresh: z.boolean().default(true),
  requiredLevel: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "missions.manage"))) {
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
  const mission = await prisma.mission.create({ data: v.data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_CREATED",
      entity: "Mission",
      entityId: mission.id,
      newData: { title: mission.title, type: mission.type },
    },
  });
  return NextResponse.json({ success: true, mission }, { status: 201 });
}
