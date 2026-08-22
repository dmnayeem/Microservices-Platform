import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sanitizeTaskAudience } from "@/lib/task-targeting";

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
  minLevel: z.number().int().min(1).max(999).default(1),
  requiredAccessLevel: z.number().int().min(0).max(99).default(0),
  // Audience targeting is NOT declared here — it comes off the raw body through
  // sanitizeTaskAudience(), the same normalizer the task routes use, so the
  // gender/age clamping lives in exactly one place.
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
  // ACTIVE only — matches what the board actually offers users.
  const taskCounts = await Promise.all(
    ids.map((id) =>
      prisma.task.count({ where: { boardId: id, status: "ACTIVE" } })
    )
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
      ...sanitizeTaskAudience(body),
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
