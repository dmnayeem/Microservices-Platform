import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dbRateLimit } from "@/lib/rate-limit-db";
import { loadTaskFor } from "@/lib/work/access";
import { bad, logWorkActivity, notFound, notifyWork, workGuard } from "@/lib/work/server";
import { taskCode } from "@/lib/work/model";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z.string().trim().min(1).max(5000),
  /** NOTE = private management note: the task's managers only. */
  kind: z.enum(["COMMENT", "NOTE"]).default("COMMENT"),
  parentId: z.string().min(1).max(64).optional(),
});

/** POST /api/admin/work/tasks/:id/comments — a message on the task, or a private note. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Write a message first.");
  const b = parsed.data;
  if (b.kind === "NOTE" && !found.caps.privateNotes) return bad("Only the task's managers can add private notes.", 403);
  if (!(await dbRateLimit(`work-comment:${a.userId}`, 30, 60_000)).ok) return bad("Too many messages — wait a minute.", 429);
  if (b.parentId) {
    const parent = await prisma.workComment.findFirst({ where: { id: b.parentId, taskId: id }, select: { kind: true } });
    if (!parent || (parent.kind === "NOTE" && !found.caps.privateNotes)) return bad("That message was not found.");
  }

  const c = await prisma.workComment.create({
    data: { taskId: id, authorId: a.userId, kind: b.kind, body: b.body, parentId: b.parentId ?? null },
  });
  const { task } = found;
  await logWorkActivity({
    taskId: id,
    projectId: task.projectId,
    actorId: a.userId,
    type: b.kind === "NOTE" ? "NOTE_ADDED" : "COMMENT_ADDED",
    // A private note's text never goes into the shared timeline.
    summary: b.kind === "NOTE" ? "Added a private note" : "Commented",
    meta: { commentId: c.id, private: b.kind === "NOTE" },
  });

  // Who hears about it: a note only the managers; a comment everyone on the task.
  const managers = [task.createdById, task.managerId].filter((u): u is string => !!u);
  const members = b.kind === "NOTE" ? [] : (await prisma.workTaskMember.findMany({ where: { taskId: id }, select: { userId: true } })).map((m) => m.userId);
  await notifyWork([...managers, ...members].filter((u) => u !== a.userId), {
    title: `${taskCode(task.number)}: new ${b.kind === "NOTE" ? "private note" : "message"}`,
    message: b.kind === "NOTE" ? task.title : b.body.slice(0, 200),
    taskId: id,
  });
  return NextResponse.json({ ok: true, id: c.id }, { status: 201 });
}
