import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadVisitTask } from "@/lib/visit-tasks-server";

/**
 * POST /api/tasks/:id/visit-return { submissionId } — the task tab is back
 * after opening a DIRECT link. The time away is measured with the server's
 * clock (open → now), never a number from the browser. Long enough → DONE
 * (the user can claim); too short → EARLY (no points; they may open it again).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { submissionId?: string };

  const task = await loadVisitTask(id);
  if (!task || task.config.kind !== "DIRECT") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const need = task.config.staySeconds;

  // Already done on this attempt? Say so (a second focus event is harmless).
  const done = await prisma.taskVisit.findFirst({
    where: { submissionId: String(body.submissionId ?? ""), userId, taskId: id, outcome: "DONE" },
    select: { elapsedSec: true },
  });
  if (done) return NextResponse.json({ outcome: "DONE", elapsed: done.elapsedSec ?? need, need });

  const open = await prisma.taskVisit.findFirst({
    where: { submissionId: String(body.submissionId ?? ""), userId, taskId: id, outcome: "OPEN" },
    orderBy: { openedAt: "desc" },
    select: { id: true, openedAt: true },
  });
  if (!open) return NextResponse.json({ outcome: "NONE", elapsed: 0, need });

  const now = new Date();
  const elapsed = Math.max(0, Math.floor((now.getTime() - open.openedAt.getTime()) / 1000));
  const outcome = elapsed >= need ? "DONE" : "EARLY";
  // Only the first return closes this open (two tabs racing write once).
  await prisma.taskVisit.updateMany({
    where: { id: open.id, outcome: "OPEN" },
    data: { outcome, returnedAt: now, elapsedSec: elapsed },
  });
  return NextResponse.json({ outcome, elapsed, need });
}
