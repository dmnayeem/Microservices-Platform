import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoardDetailClient } from "@/components/admin/boards/board-detail-client";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "boards.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "boards.manage");

  const { id } = await params;
  const board = await prisma.taskBoard.findUnique({ where: { id } });
  if (!board) notFound();

  const [assigned, available, totalCompletions] = await Promise.all([
    prisma.task.findMany({
      where: { boardId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        pointsReward: true,
        xpReward: true,
        completedCount: true,
      },
    }),
    prisma.task.findMany({
      where: { boardId: null, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        pointsReward: true,
        xpReward: true,
      },
    }),
    prisma.taskSubmission.count({
      where: {
        task: { boardId: id },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
    }),
  ]);

  return (
    <BoardDetailClient
      board={{
        id: board.id,
        title: board.title,
        description: board.description,
        iconEmoji: board.iconEmoji,
        pointsReward: board.pointsReward,
        xpReward: board.xpReward,
        isActive: board.isActive,
      }}
      assignedTasks={assigned}
      availableTasks={available}
      stats={{ taskCount: assigned.length, totalCompletions }}
      canManage={canManage}
    />
  );
}
