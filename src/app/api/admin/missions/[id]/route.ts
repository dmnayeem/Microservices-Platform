import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().nullable().optional(),
  type: z
    .enum(["TASK_COMPLETION", "LOGIN_STREAK", "REFERRAL", "SPEND", "EARN"])
    .optional(),
  targetValue: z.number().int().min(1).optional(),
  pointsReward: z.number().int().min(0).optional(),
  cashReward: z.number().min(0).optional(),
  xpReward: z.number().int().min(0).optional(),
  duration: z.enum(["DAILY", "WEEKLY"]).optional(),
  autoRefresh: z.boolean().optional(),
  requiredLevel: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const existing = await prisma.mission.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }
  const mission = await prisma.mission.update({
    where: { id },
    data: v.data,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_UPDATED",
      entity: "Mission",
      entityId: mission.id,
      oldData: { title: existing.title, isActive: existing.isActive },
      newData: v.data,
    },
  });
  return NextResponse.json({ success: true, mission });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.mission.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }
  await prisma.mission.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_DELETED",
      entity: "Mission",
      entityId: id,
      oldData: { title: existing.title, type: existing.type },
    },
  });
  return NextResponse.json({ success: true });
}
