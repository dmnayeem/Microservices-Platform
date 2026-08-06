import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

// POST /api/admin/tasks/[id]/duplicate - Duplicate a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "tasks.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Find the original task
    const originalTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!originalTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Create a duplicate
    const duplicatedTask = await prisma.task.create({
      data: {
        title: `${originalTask.title} (Copy)`,
        description: originalTask.description,
        instructions: originalTask.instructions,
        type: originalTask.type,
        status: "PAUSED", // Start as paused so admin can review before activating
        pointsReward: originalTask.pointsReward,
        xpReward: originalTask.xpReward,
        dailyLimit: originalTask.dailyLimit,
        totalLimit: originalTask.totalLimit,
        minLevel: originalTask.minLevel,
        requiredAccessLevel: originalTask.requiredAccessLevel,
        countries: originalTask.countries,
        contentUrl: originalTask.contentUrl,
        thumbnailUrl: originalTask.thumbnailUrl,
        duration: originalTask.duration,
        questions: originalTask.questions as Prisma.InputJsonValue | undefined,
        socialPlatform: originalTask.socialPlatform,
        socialAction: originalTask.socialAction,
        socialUrl: originalTask.socialUrl,
        proxyInstructions: originalTask.proxyInstructions,
        startsAt: null, // Reset dates
        expiresAt: null,
        cooldownMinutes: originalTask.cooldownMinutes,
        autoApprove: originalTask.autoApprove,
        // Reset counters
        completedCount: 0,
      },
    });

    return NextResponse.json({
      message: "Task duplicated successfully",
      task: duplicatedTask,
    });
  } catch (error) {
    console.error("Error duplicating task:", error);
    return NextResponse.json(
      { error: "Failed to duplicate task" },
      { status: 500 }
    );
  }
}
