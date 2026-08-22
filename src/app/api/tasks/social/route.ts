import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskType } from "@/generated/prisma/client";
import { mapSocialTaskRow, isPostCreationAction } from "@/lib/social-tasks";
import type { SocialTaskView } from "@/lib/social-tasks";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getTaskChainState } from "@/lib/task-sequence";
import { visibleTaskWhere } from "@/lib/task-visibility";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "available";
  // "create" = only tasks that ask the user to publish something new (a pin, a
  // post, a tweet); "engage" = everything else (follow, like, comment). The
  // action list lives inside the socialConfig JSON, so this is filtered after
  // mapping rather than in SQL.
  const kind = searchParams.get("kind");
  const matchesKind = (v: SocialTaskView): boolean => {
    if (kind === "create") return v.items.some((i) => isPostCreationAction(i.action));
    if (kind === "engage") return !v.items.every((i) => isPostCreationAction(i.action));
    return true;
  };

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
      tasks: tasks.map((t) => mapSocialTaskRow(t)).filter(matchesKind),
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
      // Shared visibility rules (adds the `hidden` flag and the startsAt window
      // this route used to skip).
      ...visibleTaskWhere(user, {
        accessLevel,
        allowedTypes: [TaskType.SOCIAL],
        type: TaskType.SOCIAL,
      }),
      ...(excludeTaskIds.length ? { id: { notIn: excludeTaskIds } } : {}),
    },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    // Over-fetch when filtering by kind so the post-map filter can still fill a
    // page; sliced back to 100 below.
    take: kind ? 250 : 100,
  });

  // Sequential-unlock: mark tasks locked behind an earlier one (feature #7).
  const { lockedTaskIds } = await getTaskChainState(session.user.id);
  return NextResponse.json({
    tasks: tasks
      .map((t) => ({
        ...mapSocialTaskRow(t),
        locked: lockedTaskIds.has(t.id),
      }))
      .filter(matchesKind)
      .slice(0, 100),
  });
}
