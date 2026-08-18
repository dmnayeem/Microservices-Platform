import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskType } from "@/generated/prisma/client";
import { mapSocialTaskRow } from "@/lib/social-tasks";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getTaskChainState } from "@/lib/task-sequence";
import { taskAudienceWhere } from "@/lib/task-targeting";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "available";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      level: true,
      country: true,
      region: true,
      division: true,
      district: true,
      subDistrict: true,
      postalCode: true,
      gender: true,
      dateOfBirth: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const userPackage = await getEffectivePackage(session.user.id);

  // For non-"available", look up the user's submissions for SOCIAL tasks.
  // In-progress vs submitted are BOTH status PENDING — the difference is the
  // submittedAt pivot (null ⇒ still being worked on, set ⇒ awaiting review).
  if (status !== "available") {
    const socialTask = { task: { type: TaskType.SOCIAL } };
    const filterByStatus: Record<string, Record<string, unknown>> = {
      in_progress: { ...socialTask, status: "PENDING", submittedAt: null },
      submitted: { ...socialTask, status: "PENDING", submittedAt: { not: null } },
      approved: { ...socialTask, status: { in: ["APPROVED", "AUTO_APPROVED"] } },
      rejected: {
        ...socialTask,
        status: { in: ["REJECTED", "REVISION_REQUESTED"] },
      },
      expired: {
        task: { type: TaskType.SOCIAL, expiresAt: { lt: new Date() } },
      },
    };
    const where = filterByStatus[status] ?? {
      ...socialTask,
      status: "PENDING",
    };
    const submissions = await prisma.taskSubmission.findMany({
      where: { userId: user.id, ...where },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const taskIds = [...new Set(submissions.map((s) => s.taskId))];
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
    });
    return NextResponse.json({
      tasks: tasks.map((t) => mapSocialTaskRow(t)),
    });
  }

  // Plan must allow social tasks at all.
  if (
    !packageHasFeature(userPackage, "tasks") ||
    !packageHasFeature(userPackage, "socialTasks")
  ) {
    return NextResponse.json({ tasks: [] });
  }

  const accessLevel = userPackage?.accessLevel ?? 0;

  // Hide tasks the user has already started or finished — they belong in the
  // In Progress / Submitted / Approved tabs, not "Available" (was showing a
  // "Start" button on already-submitted tasks).
  const actedSubs = await prisma.taskSubmission.findMany({
    where: {
      userId: user.id,
      task: { type: TaskType.SOCIAL },
      status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] },
    },
    select: { taskId: true },
  });
  const excludeTaskIds = [...new Set(actedSubs.map((s) => s.taskId))];

  const tasks = await prisma.task.findMany({
    where: {
      type: TaskType.SOCIAL,
      status: TaskStatus.ACTIVE,
      minLevel: { lte: user.level },
      requiredAccessLevel: { lte: accessLevel },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      // STRICT audience targeting (country/area/gender/age).
      AND: taskAudienceWhere(user),
      ...(excludeTaskIds.length ? { id: { notIn: excludeTaskIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Sequential-unlock: mark tasks locked behind an earlier one (feature #7).
  const { lockedTaskIds } = await getTaskChainState(session.user.id);
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...mapSocialTaskRow(t),
      locked: lockedTaskIds.has(t.id),
    })),
  });
}
