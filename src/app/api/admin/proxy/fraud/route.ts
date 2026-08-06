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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const raw = await prisma.taskSubmission.findMany({
    where: {
      status: SubmissionStatus.REJECTED,
      createdAt: { gte: sevenDaysAgo },
      task: { type: TaskType.PROXY },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  type WithRels = (typeof raw)[number] & {
    user: { id: string; name: string | null; email: string };
    task: { id: string; title: string };
  };
  const rejected = raw as WithRels[];

  // Group by user to surface repeat offenders
  const offenders = new Map<
    string,
    { userId: string; name: string; count: number; lastReason: string | null }
  >();
  for (const r of rejected) {
    const cur = offenders.get(r.user.id);
    if (cur) {
      cur.count += 1;
    } else {
      offenders.set(r.user.id, {
        userId: r.user.id,
        name: r.user.name ?? r.user.email,
        count: 1,
        lastReason: r.rejectionReason ?? null,
      });
    }
  }

  return NextResponse.json({
    alerts: rejected.map((r) => ({
      id: r.id,
      userId: r.user.id,
      userName: r.user.name ?? r.user.email,
      taskTitle: r.task.title,
      reason: r.rejectionReason ?? "Unknown",
      createdAt: r.createdAt.toISOString(),
    })),
    repeatOffenders: Array.from(offenders.values())
      .filter((o) => o.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  });
}
