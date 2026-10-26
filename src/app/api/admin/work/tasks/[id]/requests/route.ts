import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { loadTaskFor } from "@/lib/work/access";
import { bad, logWorkActivity, notFound, notifyWork, workGuard } from "@/lib/work/server";
import { taskCode } from "@/lib/work/model";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  /** UPDATE / REMINDER: a manager asks the doers. CLARIFICATION: a doer asks the manager. */
  kind: z.enum(["UPDATE", "REMINDER", "CLARIFICATION"]),
  /** One doer; empty = every assignee/collaborator. */
  toId: z.string().min(1).max(64).optional(),
  message: z.string().trim().min(3).max(2000),
});

const DEFAULT_MESSAGE =
  "Please submit the latest progress report, including completed quantity, remaining work, blockers, evidence, and your expected completion date.";

/**
 * POST /api/admin/work/tasks/:id/requests — ask for an update, remind, or ask
 * for clarification. A cooldown per task + person + kind (setting
 * work.reminder_cooldown_minutes, default 60) stops repeated pings; every
 * request is kept on the task.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  const { task, caps } = found;
  const parsed = schema.safeParse(await req.json().catch(() => ({ message: DEFAULT_MESSAGE })));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request");
  const b = parsed.data;

  let to: string[];
  if (b.kind === "CLARIFICATION") {
    if (!caps.report && !caps.memberRole) return bad("Only people on this task can ask for clarification.", 403);
    to = [task.managerId ?? task.createdById];
  } else {
    if (!caps.manage && !caps.review) return bad("Only the task's managers or reviewers can request updates.", 403);
    const doers = await prisma.workTaskMember.findMany({
      where: { taskId: id, role: { in: ["ASSIGNEE", "COLLABORATOR"] } },
      select: { userId: true },
    });
    const ids = doers.map((d) => d.userId);
    if (b.toId && !ids.includes(b.toId)) return bad("That person isn't doing this task.");
    to = b.toId ? [b.toId] : ids;
  }
  to = to.filter((u) => u && u !== a.userId);
  if (!to.length) return bad("There is nobody to send this to.");

  const cooldownMin = Math.max(0, Number(await getSetting<number>("work.reminder_cooldown_minutes", 60)) || 0);
  if (cooldownMin > 0) {
    const recent = await prisma.workRequest.findMany({
      where: { taskId: id, kind: b.kind, toId: { in: to }, createdAt: { gte: new Date(Date.now() - cooldownMin * 60_000) } },
      select: { toId: true },
    });
    const blocked = new Set(recent.map((r) => r.toId));
    to = to.filter((u) => !blocked.has(u));
    if (!to.length) return bad(`Already sent within the last ${cooldownMin} minutes.`, 429);
  }

  await prisma.workRequest.createMany({
    data: to.map((toId) => ({ taskId: id, kind: b.kind, fromId: a.userId, toId, message: b.message })),
  });
  const code = taskCode(task.number);
  const label = b.kind === "UPDATE" ? "Update requested" : b.kind === "REMINDER" ? "Reminder" : "Clarification requested";
  await logWorkActivity({
    taskId: id,
    projectId: task.projectId,
    actorId: a.userId,
    type: `REQUEST_${b.kind}`,
    summary: `${label} — sent to ${to.length} person(s)`,
    meta: { to, message: b.message },
  });
  await notifyWork(to, {
    title: `${code}: ${label.toLowerCase()}`,
    message: b.message,
    link: `/admin/work/tasks/${id}${b.kind === "CLARIFICATION" ? "" : "#report"}`,
    taskId: id,
  });
  return NextResponse.json({ ok: true, sent: to.length }, { status: 201 });
}

const answerSchema = z.object({ requestId: z.string().min(1).max(64), reply: z.string().trim().max(2000).optional() });

/** PATCH — the recipient marks a request answered (a report answers update requests by itself). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  const parsed = answerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid request.");
  const r = await prisma.workRequest.updateMany({
    where: { id: parsed.data.requestId, taskId: id, toId: a.userId, status: "OPEN" },
    data: { status: "ANSWERED", answeredAt: new Date() },
  });
  if (r.count === 0) return bad("Nothing to answer.", 409);
  if (parsed.data.reply) {
    await prisma.workComment.create({ data: { taskId: id, authorId: a.userId, kind: "COMMENT", body: parsed.data.reply } });
  }
  await logWorkActivity({ taskId: id, actorId: a.userId, type: "REQUEST_ANSWERED", summary: "Answered a request" });
  return NextResponse.json({ ok: true });
}
