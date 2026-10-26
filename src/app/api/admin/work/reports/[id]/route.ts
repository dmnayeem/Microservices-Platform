import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { loadTaskFor } from "@/lib/work/access";
import { bad, logWorkActivity, notFound, notifyWork, workGuard } from "@/lib/work/server";
import { taskCode } from "@/lib/work/model";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "CHANGES"]),
  note: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/admin/work/reports/:id — review a progress report.
 * Approve counts its numbers; Reject / Request changes need a reason and keep
 * the report as it was filed. One decision only (compare-and-set on
 * SUBMITTED); nobody approves their own report.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const report = await prisma.workReport.findUnique({ where: { id }, select: { id: true, taskId: true, authorId: true, status: true } });
  if (!report) return notFound();
  const found = await loadTaskFor(a, report.taskId);
  if (!found) return notFound();
  if (!found.caps.review) return bad("Only a reviewer or manager of this task can review its reports.", 403);
  if (report.authorId === a.userId && !a.isSuper) return bad("You can't review your own report.", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Choose approve, reject or request changes.");
  const { decision, note } = parsed.data;
  if (decision !== "APPROVE" && !note) return bad("Say why — the person who filed it will see this.");

  const status = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
  const r = await prisma.workReport.updateMany({
    where: { id, status: "SUBMITTED" },
    data: { status, reviewerId: a.userId, reviewedAt: new Date(), reviewNote: note || null },
  });
  if (r.count === 0) return bad("This report has already been reviewed.", 409);

  const task = found.task;
  if (decision === "CHANGES" && ["IN_PROGRESS", "IN_REVIEW"].includes(task.status)) {
    await prisma.workTask.updateMany({ where: { id: task.id, status: task.status }, data: { status: "CHANGES_REQUESTED" } });
  }
  const code = taskCode(task.number);
  const word = decision === "APPROVE" ? "approved" : decision === "REJECT" ? "rejected" : "returned for changes";
  await logWorkActivity({
    taskId: task.id,
    projectId: task.projectId,
    actorId: a.userId,
    type: `REPORT_${status}`,
    summary: `Report ${word}${note ? ` — ${note}` : ""}`,
    meta: { reportId: id },
  });
  await notifyWork([report.authorId].filter((u) => u !== a.userId), {
    title: `${code}: report ${word}`,
    message: note || task.title,
    taskId: task.id,
  });
  await writeAudit({ actorId: a.userId, action: `WORK_REPORT_${status}`, entity: "WorkReport", entityId: id, summary: `${code}: report ${word}` });
  return NextResponse.json({ ok: true, status });
}
