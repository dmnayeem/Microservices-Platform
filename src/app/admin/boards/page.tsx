import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoardsClient } from "@/components/admin/boards/boards-client";

export default async function TaskBoardsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "boards.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "boards.manage");
  const boards = await prisma.taskBoard.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  const ids = boards.map((b) => b.id);
  // Count ACTIVE tasks: the unfiltered count included DRAFT/PAUSED/expired
  // rows, so admin's "12 tasks" sat next to a user board showing 7.
  const [taskCounts, claimCounts] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        prisma.task.count({ where: { boardId: id, status: "ACTIVE" } })
      )
    ),
    Promise.all(
      ids.map((id) => prisma.boardClaim.count({ where: { boardId: id } }))
    ),
  ]);
  const taskByBoard = new Map(ids.map((id, i) => [id, taskCounts[i] ?? 0]));
  const claimByBoard = new Map(ids.map((id, i) => [id, claimCounts[i] ?? 0]));

  const enriched = boards.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    iconEmoji: b.iconEmoji,
    imageUrl: b.imageUrl,
    category: b.category,
    expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
    pointsReward: b.pointsReward,
    xpReward: b.xpReward,
    isActive: b.isActive,
    order: b.order,
    unlockBoardId: b.unlockBoardId,
    taskCount: taskByBoard.get(b.id) ?? 0,
    claimCount: claimByBoard.get(b.id) ?? 0,
    // Eligibility + audience, so Edit round-trips them instead of silently
    // resetting targeting to "everyone" on the next save.
    minLevel: b.minLevel,
    requiredAccessLevel: b.requiredAccessLevel,
    countries: b.countries,
    genders: b.genders,
    regions: b.regions,
    divisions: b.divisions,
    districts: b.districts,
    subDistricts: b.subDistricts,
    postalCodes: b.postalCodes,
    minAge: b.minAge,
    maxAge: b.maxAge,
  }));

  return <BoardsClient initialBoards={enriched} canManage={canManage} />;
}
