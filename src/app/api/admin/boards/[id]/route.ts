import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sanitizeTaskAudience, hasAudienceKeys } from "@/lib/task-targeting";

const BOARD_CATEGORIES = [
  "Marketing",
  "Development",
  "Design",
  "Sales",
  "Learning",
  "Other",
] as const;

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  iconEmoji: z.string().max(8).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  category: z.enum(BOARD_CATEGORIES).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  pointsReward: z.number().int().min(0).optional(),
  xpReward: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
  unlockBoardId: z.string().cuid().nullable().optional(),
  minLevel: z.number().int().min(1).max(999).optional(),
  requiredAccessLevel: z.number().int().min(0).max(99).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "boards.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const board = await prisma.taskBoard.findUnique({ where: { id } });
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
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
  });

  const completedSubmissions = tasks.length
    ? await prisma.taskSubmission.count({
        where: {
          taskId: { in: tasks.map((t) => t.id) },
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
      })
    : 0;

  // Analytics: claim aggregates + 5 most recent claimers
  const claimAgg = await prisma.boardClaim.aggregate({
    where: { boardId: id },
    _count: { _all: true },
    _sum: { pointsEarned: true, xpEarned: true },
  });
  const recentClaims = await prisma.boardClaim.findMany({
    where: { boardId: id },
    orderBy: { claimedAt: "desc" },
    take: 5,
  });
  const claimUsers = recentClaims.length
    ? await prisma.user.findMany({
        where: { id: { in: recentClaims.map((c) => c.userId) } },
        select: { id: true, name: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(claimUsers.map((u) => [u.id, u]));
  const distinctParticipants = tasks.length
    ? await prisma.taskSubmission.findMany({
        where: {
          taskId: { in: tasks.map((t) => t.id) },
          status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
        },
        select: { userId: true },
        distinct: ["userId"],
      })
    : [];
  const uniqueParticipants = distinctParticipants.length;

  return NextResponse.json({
    board,
    tasks,
    stats: {
      taskCount: tasks.length,
      totalCompletions: completedSubmissions,
      totalClaims: claimAgg._count._all,
      pointsDistributed: claimAgg._sum.pointsEarned ?? 0,
      xpDistributed: claimAgg._sum.xpEarned ?? 0,
      uniqueParticipants,
      recentClaims: recentClaims.map((c) => {
        const u = userById.get(c.userId);
        return {
          id: c.id,
          pointsEarned: c.pointsEarned,
          xpEarned: c.xpEarned,
          claimedAt: c.claimedAt.toISOString(),
          user: {
            id: u?.id ?? c.userId,
            name: u?.name ?? null,
            email: u?.email ?? null,
            image: u?.avatar ?? null,
          },
        };
      }),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "boards.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const before = await prisma.taskBoard.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  // Validate prerequisite (cycle protection: can't be self or a descendant)
  if (v.data.unlockBoardId !== undefined && v.data.unlockBoardId !== null) {
    if (v.data.unlockBoardId === id) {
      return NextResponse.json(
        { error: "A board cannot require itself as a prerequisite" },
        { status: 400 }
      );
    }
    const prereq = await prisma.taskBoard.findUnique({
      where: { id: v.data.unlockBoardId },
      select: { id: true, unlockBoardId: true },
    });
    if (!prereq) {
      return NextResponse.json(
        { error: "Prerequisite board not found" },
        { status: 400 }
      );
    }
    // Walk the chain upward — if we hit `id` we have a cycle.
    let walker: string | null = prereq.unlockBoardId;
    let depth = 0;
    while (walker && depth < 32) {
      if (walker === id) {
        return NextResponse.json(
          { error: "Selected prerequisite would create a cycle" },
          { status: 400 }
        );
      }
      const nextStep: { unlockBoardId: string | null } | null =
        await prisma.taskBoard.findUnique({
          where: { id: walker },
          select: { unlockBoardId: true },
        });
      walker = nextStep?.unlockBoardId ?? null;
      depth++;
    }
  }

  const board = await prisma.taskBoard.update({
    where: { id },
    data: {
      ...v.data,
      // Targeting is replaced wholesale whenever the form sends any of the nine
      // keys — a partial merge would leave a stale dimension in place.
      ...(hasAudienceKeys(body) ? sanitizeTaskAudience(body) : {}),
      ...(v.data.expiresAt !== undefined
        ? { expiresAt: v.data.expiresAt ? new Date(v.data.expiresAt) : null }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BOARD_UPDATED",
      entity: "TaskBoard",
      entityId: id,
      oldData: { title: before.title, isActive: before.isActive },
      newData: { ...v.data },
    },
  });

  return NextResponse.json({ board });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "boards.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Detach tasks before delete
  await prisma.task.updateMany({
    where: { boardId: id },
    data: { boardId: null },
  });

  await prisma.taskBoard.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BOARD_DELETED",
      entity: "TaskBoard",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
