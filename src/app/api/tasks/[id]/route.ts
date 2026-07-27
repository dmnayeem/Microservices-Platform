import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserDayContext } from "@/lib/user-day";

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

    // Check if user has active submission
    const activeSubmission = await prisma.taskSubmission.findFirst({
      where: {
        taskId: id,
        userId: session.user.id,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({
      task: {
        ...task,
        completedCount: task._count.submissions,
        remainingSlots: task.totalLimit
          ? task.totalLimit - task.completedCount
          : null,
      },
      userStatus: {
        hasActiveSubmission: !!activeSubmission,
        activeSubmissionId: activeSubmission?.id,
        // Back-compat alias — older clients still read this field.
        completedToday: dailyLimitReached || totalLimitReached,
        // Explicit, accurate flags for the new UI.
        dailyLimitReached,
        totalLimitReached,
        remainingToday,
        dailyLimit: effectiveDailyLimit,
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
