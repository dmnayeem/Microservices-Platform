import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const BOARD_CATEGORIES = [
  "Marketing",
  "Development",
  "Design",
  "Sales",
  "Learning",
  "Other",
] as const;

const createSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  iconEmoji: z.string().max(8).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  category: z.enum(BOARD_CATEGORIES).nullable().optional(),
  // ISO datetime string; null = no deadline
  expiresAt: z.string().datetime().nullable().optional(),
  pointsReward: z.number().int().min(0).default(0),
  xpReward: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0),
  // Optional prerequisite board id; null = no prerequisite
  unlockBoardId: z.string().cuid().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "boards.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const boards = await prisma.taskBoard.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  const ids = boards.map((b) => b.id);
  const taskCounts = await Promise.all(
    ids.map((id) => prisma.task.count({ where: { boardId: id } }))
  );

  return NextResponse.json({
    boards: boards.map((b, i) => ({ ...b, taskCount: taskCounts[i] ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "boards.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  // Validate prerequisite board exists when provided
  if (v.data.unlockBoardId) {
    const prereq = await prisma.taskBoard.findUnique({
      where: { id: v.data.unlockBoardId },
      select: { id: true },
    });
    if (!prereq) {
      return NextResponse.json(
        { error: "Prerequisite board not found" },
        { status: 400 }
      );
    }
  }

  const board = await prisma.taskBoard.create({
    data: {
      ...v.data,
      expiresAt: v.data.expiresAt ? new Date(v.data.expiresAt) : null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BOARD_CREATED",
      entity: "TaskBoard",
      entityId: board.id,
      newData: { title: board.title, pointsReward: board.pointsReward },
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
