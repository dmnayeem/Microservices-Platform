import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MISSIONS_ACTIVE_TAG } from "@/lib/cache-tags";
import { sanitizeTaskAudience, hasAudienceKeys } from "@/lib/task-targeting";
import {
  missionUpdateSchema,
  missionData,
  missionWindowError,
} from "@/lib/missions-admin";

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
  const v = missionUpdateSchema.safeParse(body);
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

  const windowErr = missionWindowError(
    v.data.startAt ?? existing.startAt?.toISOString() ?? null,
    v.data.endAt ?? existing.endAt?.toISOString() ?? null
  );
  if (windowErr) return NextResponse.json({ error: windowErr }, { status: 400 });

  // A mission cannot unlock itself, and a two-step cycle would lock both
  // forever with no way out through the UI.
  if (v.data.unlockMissionId) {
    if (v.data.unlockMissionId === id) {
      return NextResponse.json(
        { error: "A mission can't be its own prerequisite." },
        { status: 400 }
      );
    }
    const prereq = await prisma.mission.findUnique({
      where: { id: v.data.unlockMissionId },
      select: { id: true, unlockMissionId: true },
    });
    if (!prereq) {
      return NextResponse.json(
        { error: "Prerequisite mission not found" },
        { status: 400 }
      );
    }
    if (prereq.unlockMissionId === id) {
      return NextResponse.json(
        { error: "That would create a loop — the two missions would lock each other." },
        { status: 400 }
      );
    }
  }

  const mission = await prisma.mission.update({
    where: { id },
    data: {
      ...missionData(v.data),
      // Replace targeting wholesale, or not at all — see hasAudienceKeys.
      ...(hasAudienceKeys(body) ? sanitizeTaskAudience(body) : {}),
    } as never,
  });

  revalidateTag(MISSIONS_ACTIVE_TAG, "max");

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_UPDATED",
      entity: "Mission",
      entityId: mission.id,
      oldData: { title: existing.title, isActive: existing.isActive },
      newData: { title: mission.title, isActive: mission.isActive },
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

  // Deleting cascades the progress and action-log rows away, so a mission users
  // have already worked on is deactivated instead. Their progress survives if
  // it's switched back on, and nobody loses an unclaimed reward silently.
  const worked = await prisma.userMissionProgress.count({
    where: { missionId: id },
  });
  if (worked > 0) {
    const mission = await prisma.mission.update({
      where: { id },
      data: { isActive: false },
    });
    revalidateTag(MISSIONS_ACTIVE_TAG, "max");
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "MISSION_DEACTIVATED",
        entity: "Mission",
        entityId: id,
        oldData: { title: existing.title },
        newData: { reason: `${worked} users have progress; deactivated instead of deleted` },
      },
    });
    return NextResponse.json({
      success: true,
      deactivated: true,
      mission,
      message: `${worked} user${worked === 1 ? " has" : "s have"} progress on this mission, so it was deactivated instead of deleted.`,
    });
  }

  await prisma.mission.delete({ where: { id } });
  revalidateTag(MISSIONS_ACTIVE_TAG, "max");
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MISSION_DELETED",
      entity: "Mission",
      entityId: id,
      oldData: { title: existing.title, actionType: existing.actionType },
    },
  });
  return NextResponse.json({ success: true });
}
