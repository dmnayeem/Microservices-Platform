import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskType } from "@/generated/prisma/client";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import { getTaskChainState } from "@/lib/task-sequence";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { level: true, country: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userPackage = await getEffectivePackage(session.user.id);

  if (
    !packageHasFeature(userPackage, "tasks") ||
    !packageHasFeature(userPackage, "proxyTasks")
  ) {
    return NextResponse.json({ tasks: [] });
  }

  const accessLevel = userPackage?.accessLevel ?? 0;

  const tasks = await prisma.task.findMany({
    where: {
      type: TaskType.PROXY,
      status: TaskStatus.ACTIVE,
      minLevel: { lte: user.level },
      requiredAccessLevel: { lte: accessLevel },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const { lockedTaskIds } = await getTaskChainState(session.user.id);
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      pointsReward: t.pointsReward,
      duration: t.duration ?? 5,
      country: t.countries[0] ?? user.country ?? "Worldwide",
      serverHost: undefined,
      serverPort: undefined,
      locked: lockedTaskIds.has(t.id),
    })),
  });
}
