import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TaskType, SubmissionStatus } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "proxy.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // last hour
  const raw = await prisma.taskSubmission.findMany({
    where: {
      status: SubmissionStatus.PENDING,
      createdAt: { gte: cutoff },
      task: { type: TaskType.PROXY },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      task: {
        select: {
          id: true,
          title: true,
          duration: true,
          countries: true,
          pointsReward: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  type WithRels = (typeof raw)[number] & {
    user: { id: string; name: string | null; email: string };
    task: {
      id: string;
      title: string;
      duration: number | null;
      countries: string[];
      pointsReward: number;
    };
  };
  const sessions = raw as WithRels[];

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.user.id,
      userName: s.user.name ?? s.user.email,
      taskId: s.task.id,
      taskTitle: s.task.title,
      duration: s.task.duration,
      country: s.task.countries[0] ?? null,
      pointsReward: s.task.pointsReward,
      startedAt: s.createdAt.toISOString(),
      elapsedSec: Math.floor((Date.now() - s.createdAt.getTime()) / 1000),
    })),
  });
}
