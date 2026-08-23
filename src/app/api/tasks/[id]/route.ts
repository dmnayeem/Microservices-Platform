import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserDayContext } from "@/lib/user-day";
import { normalizeSocialConfig } from "@/lib/social-tasks";
import { verifyCodeFor } from "@/lib/task-verify-code";
import { matchesTaskAudience } from "@/lib/task-targeting";
import { toPlayerTask } from "@/lib/task-player-view";

// GET /api/tasks/:id - Get single task details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        categories: {
          select: { id: true, name: true, icon: true, color: true },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // `hidden` is the super-admin hard hide — `visibleTaskWhere()` documents it
    // as "never in any user-facing list". This route read the row by id and
    // enforced nothing, so a task pulled for fraud, or staged for a future
    // campaign, was fully readable (and startable, via /start) by anyone who
    // had the id. Treat it as absent rather than forbidden: confirming that a
    // hidden task exists is itself a leak.
    if (task.hidden) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Audience targeting eligibility — lets the detail view show a "not available
    // for your profile/area" state instead of a start button.
    const viewer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
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
    const audienceEligible = matchesTaskAudience(task, viewer ?? {});

    // Check if user has active submission
    const activeSubmission = await prisma.taskSubmission.findFirst({
      where: {
        taskId: id,
        userId: session.user.id,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    // Latest REVIEWED submission (so the detail view can show the admin's
    // decision + feedback and offer a "Redo" when it was rejected / sent back).
    const lastReviewed = activeSubmission
      ? null
      : await prisma.taskSubmission.findFirst({
          where: {
            taskId: id,
            userId: session.user.id,
            status: { in: ["REJECTED", "REVISION_REQUESTED"] },
          },
          orderBy: { reviewedAt: "desc" },
          select: {
            status: true,
            rejectionReason: true,
            feedback: true,
            score: true,
            penaltyPoints: true,
          },
        });

    // Count today's submissions for this user (used for dailyLimit gate).
    // Statuses APPROVED/AUTO_APPROVED/PENDING all consume a daily slot —
    // matches the legacy /api/tasks/[id]/start convention. Boundary is the
    // user's LOCAL midnight.
    const { startOfDayUtc: todayStart } = await getUserDayContext(session.user.id);

    const todayCount = await prisma.taskSubmission.count({
      where: {
        taskId: id,
        userId: session.user.id,
        createdAt: { gte: todayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
    });

    const effectiveDailyLimit = task.dailyLimit ?? 1;
    const dailyLimitReached = todayCount >= effectiveDailyLimit;
    const totalLimitReached =
      !!task.totalLimit && task.completedCount >= task.totalLimit;
    const remainingToday = Math.max(0, effectiveDailyLimit - todayCount);

    // Per-user verification codes for auto-verify-by-code social items. Derived
    // server-side (HMAC) so each user's code is unique and can't be computed on
    // the client. Keyed by item index → the code the user must embed in content.
    const socialVerifyCodes: Record<number, string> = {};
    if (task.type === "SOCIAL") {
      const { items } = normalizeSocialConfig(task.socialConfig);
      items.forEach((it, idx) => {
        if (it.verify === "CODE") {
          socialVerifyCodes[idx] = verifyCodeFor(id, idx, session.user.id);
        }
      });
    }

    return NextResponse.json({
      task: {
        // Sanitised, not spread. See task-player-view.ts — the raw row carries
        // the quiz answer key and the video/article proof keys.
        ...toPlayerTask(task),
        // The real credited counter, not `_count.submissions`. Shipping the
        // attempt count here made a card read "47 completed / 50" on a task
        // that actually closes at 31 — the list route fixed exactly this and
        // documented it; the detail route still had the bug, and it disagreed
        // with `remainingSlots` on the very next line.
        completedCount: task.completedCount,
        attemptCount: task._count.submissions,
        remainingSlots: task.totalLimit
          ? task.totalLimit - task.completedCount
          : null,
      },
      socialVerifyCodes,
      userStatus: {
        audienceEligible,
        hasActiveSubmission: !!activeSubmission,
        activeSubmissionId: activeSubmission?.id,
        // Server-accrued watch seconds so a VIDEO task resumes instead of
        // restarting at 0 when the user navigates away and back.
        watchedSeconds: activeSubmission?.watchedSeconds ?? 0,
        // `submittedAt` set ⇒ the user already submitted (awaiting review); null ⇒
        // still in-progress (started but not yet submitted). Views use this to show
        // an "awaiting review" state instead of the submit form.
        awaitingReview: !!activeSubmission?.submittedAt,
        // Back-compat alias — older clients still read this field.
        completedToday: dailyLimitReached || totalLimitReached,
        // Explicit, accurate flags for the new UI.
        dailyLimitReached,
        totalLimitReached,
        remainingToday,
        dailyLimit: effectiveDailyLimit,
        // Last admin decision + feedback (null while a fresh attempt is active).
        lastReview: lastReviewed
          ? {
              status: lastReviewed.status,
              rejectionReason: lastReviewed.rejectionReason,
              feedback: lastReviewed.feedback,
              score: lastReviewed.score,
              penaltyPoints: lastReviewed.penaltyPoints,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}
