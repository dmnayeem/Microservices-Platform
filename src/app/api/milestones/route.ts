import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMilestones, milestoneProgress } from "@/lib/milestones";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const progress = await milestoneProgress(userId);
  if (!progress) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Track claimed milestones via auditLog (action = MILESTONE_CLAIMED, entity = Milestone, entityId = milestoneId)
  const claimedRows = await prisma.auditLog.findMany({
    where: {
      userId,
      action: "MILESTONE_CLAIMED",
      entity: "Milestone",
    },
    select: { entityId: true },
  });
  const claimedIds = new Set(
    claimedRows.map((r) => r.entityId).filter((id): id is string => !!id)
  );

  // A milestone the admin switched off is hidden — unless this user already
  // claimed it, so their history does not silently lose a row.
  const live = await getMilestones();
  const milestones = live
    .filter((m) => m.enabled || claimedIds.has(m.id))
    .map((m) => {
    const current = progress.get(m.id) ?? 0;
    const completed = current >= m.target;
    const claimed = claimedIds.has(m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      current,
      target: m.target,
      unit: m.unit,
      pointsReward: m.pointsReward,
      badgeName: m.badgeName,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      claimed,
    };
  });

  return NextResponse.json({ milestones });
}
