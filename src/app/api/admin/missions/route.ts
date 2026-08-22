import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MISSIONS_ACTIVE_TAG } from "@/lib/cache-tags";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
import {
  missionCreateSchema,
  missionData,
  missionWindowError,
} from "@/lib/missions-admin";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "missions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = missionCreateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const windowErr = missionWindowError(v.data.startAt, v.data.endAt);
  if (windowErr) return NextResponse.json({ error: windowErr }, { status: 400 });

  if (v.data.unlockMissionId) {
    const prereq = await prisma.mission.findUnique({
      where: { id: v.data.unlockMissionId },
      select: { id: true },
    });
    if (!prereq) {
      return NextResponse.json(
        { error: "Prerequisite mission not found" },
        { status: 400 }
      );
    }
  }

  const mission = await prisma.mission.create({
    data: {
      ...missionData(v.data),
      ...sanitizeTaskAudience(body),
    } as never,
  });

  // The goal engine caches the active index; without this a new mission counts
  // nothing for up to 60s and an admin thinks it's broken.
  revalidateTag(MISSIONS_ACTIVE_TAG, "max");

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_CREATED",
      entity: "Mission",
      entityId: mission.id,
      newData: { title: mission.title, actionType: mission.actionType },
    },
  });
  return NextResponse.json({ success: true, mission }, { status: 201 });
}
