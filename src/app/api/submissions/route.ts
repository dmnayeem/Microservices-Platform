import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TaskType, SubmissionStatus } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20)
  );

  const where: Prisma.TaskSubmissionWhereInput = { userId: session.user.id };

  if (statusParam) {
    const statuses = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SubmissionStatus =>
        Object.values(SubmissionStatus).includes(s as SubmissionStatus)
      );
    if (statuses.length > 0) {
      where.status = { in: statuses };
    }
  }

  if (typeParam) {
    const validType = Object.values(TaskType).includes(typeParam as TaskType)
      ? (typeParam as TaskType)
      : null;
    if (validType) {
      where.task = { type: validType };
    }
  }

  const [submissions, total] = await Promise.all([
    prisma.taskSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.taskSubmission.count({ where }),
  ]);

  // Fetch task titles
  const taskIds = [...new Set(submissions.map((s) => s.taskId))];
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true, type: true },
  });
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return NextResponse.json({
    submissions: submissions.map((s) => {
      const t = taskMap.get(s.taskId);
      return {
        id: s.id,
        task: { id: s.taskId, title: t?.title ?? "Unknown task", type: t?.type },
        status: s.status,
        pointsReward: s.pointsEarned ?? 0,
        rejectionReason: s.rejectionReason,
        adminNote: s.feedback,
        score: s.score,
        penaltyPoints: s.penaltyPoints,
        createdAt: s.createdAt.toISOString(),
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
