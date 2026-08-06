import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const assignSchema = z.object({
  taskIds: z.array(z.string()).min(1),
});

const removeSchema = z.object({
  taskIds: z.array(z.string()).min(1),
});

// POST = assign tasks to this board (sets boardId)
export async function POST(
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
  const v = assignSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const board = await prisma.taskBoard.findUnique({ where: { id } });
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const result = await prisma.task.updateMany({
    where: { id: { in: v.data.taskIds } },
    data: { boardId: id },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BOARD_TASKS_ASSIGNED",
      entity: "TaskBoard",
      entityId: id,
      newData: { count: result.count, taskIds: v.data.taskIds },
    },
  });

  return NextResponse.json({ success: true, assigned: result.count });
}

// DELETE = remove tasks from board (clears boardId)
export async function DELETE(
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
  const v = removeSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const result = await prisma.task.updateMany({
    where: { id: { in: v.data.taskIds }, boardId: id },
    data: { boardId: null },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BOARD_TASKS_REMOVED",
      entity: "TaskBoard",
      entityId: id,
      newData: { count: result.count, taskIds: v.data.taskIds },
    },
  });

  return NextResponse.json({ success: true, removed: result.count });
}
