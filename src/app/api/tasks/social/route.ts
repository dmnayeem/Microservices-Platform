import { assertPageVisible } from "@/lib/page-visibility-server";
import { currentDevice } from "@/lib/device-current";
import { NextRequest, NextResponse } from "next/server";
import { effectiveRepeat } from "@/lib/task-repeat";
import { getUserDayContext } from "@/lib/user-day";
import { syncCountryMode } from "@/lib/country-mode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskType } from "@/generated/prisma/client";
import { mapSocialTaskRow, isPostCreationAction } from "@/lib/social-tasks";
import type { SocialTaskView } from "@/lib/social-tasks";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getTaskChainState } from "@/lib/task-sequence";
import { visibleTaskWhere } from "@/lib/task-visibility";

export async function GET(request: NextRequest) {
  await syncCountryMode(); // country targeting: profile+IP or IP only
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /social-tasks is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/social-tasks");
  if (pageHidden) return pageHidden;
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
      // IP country — the fallback when the profile has none (lib/effective-country).
      lastCountry: true,
      signupCountry: true,
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
  // Higher-plan tasks are listed as upgrade offers (same rule as lib/task-list).
  const plans = (await prisma.package.findMany({
    where: { isActive: true },
    select: { name: true, slug: true, accessLevel: true },
    orderBy: { accessLevel: "asc" },
    cacheStrategy: { ttl: 300, swr: 600 },
  })) as unknown as { name: string; slug: string; accessLevel: number }[];
  const previewLevel = Math.max(accessLevel, ...plans.map((p) => p.accessLevel));

  // Hide tasks the user has already SUBMITTED or been paid for — they belong in
  // the Submitted / Approved tabs (this list once showed "Start" on a submitted
  // task). A task that is started but not yet submitted stays HERE, first, as
  // "Continue": it used to vanish into the In Progress tab the moment the user
  // opened it, and people who left to make the post could not find it again.
  const actedSubs = await prisma.taskSubmission.findMany({
    where: {
      userId: user.id,
      task: { type: TaskType.SOCIAL },
      status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] },
    },
    select: {
      taskId: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      task: { select: { type: true, repeat: true } },
    },
  }) as unknown as {
    taskId: string;
    status: string;
    submittedAt: Date | null;
    createdAt: Date;
    task: { type: string; repeat: string | null } | null;
  }[];
  const inProgressIds = new Set(
    actedSubs.filter((s) => s.status === "PENDING" && s.submittedAt === null).map((s) => s.taskId)
  );
  // A once-per-member task stays gone; a daily one only for the member's
  // today — it is back after their midnight (owner, 2026-10-15).
  const { startOfDayUtc } = await getUserDayContext(user.id);
  const excludeTaskIds = [
    ...new Set(
      actedSubs
        .filter((s) => !inProgressIds.has(s.taskId))
        .filter((s) =>
          s.task && effectiveRepeat(s.task) === "DAILY" ? s.createdAt >= startOfDayUtc : true
        )
        .map((s) => s.taskId)
    ),
  ];

  const tasks = await prisma.task.findMany({
    where: {
      // Shared visibility rules (adds the `hidden` flag and the startsAt window
      // this route used to skip).
      ...visibleTaskWhere({ ...user, device: await currentDevice() }, {
        accessLevel: previewLevel,
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
        requireApp: t.requireApp,
        requirePush: t.requirePush,
        requireProfile: t.requireProfile,
        requireKyc: t.requireKyc,
        completedCount: t.completedCount,
        totalLimit: t.totalLimit,
        planLock:
          t.requiredAccessLevel > accessLevel
            ? (() => {
                const pl = plans.find((p) => p.accessLevel >= t.requiredAccessLevel);
                return pl ? { name: pl.name, slug: pl.slug } : null;
              })()
            : null,
        locked: t.requiredAccessLevel <= accessLevel && lockedTaskIds.has(t.id),
        inProgress: inProgressIds.has(t.id),
      }))
      .filter(matchesKind)
      // Unfinished ones first — they are the ones the user came back for.
      .sort((a, b) => Number(b.inProgress) - Number(a.inProgress))
      .slice(0, 100),
  });
}
