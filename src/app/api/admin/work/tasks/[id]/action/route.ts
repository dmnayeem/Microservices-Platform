import { NextRequest, NextResponse } from "next/server";
import { createNextOccurrence } from "@/lib/work/recurrence";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { loadTaskFor } from "@/lib/work/access";
import { bad, logWorkActivity, notFound, notifyWork, workGuard } from "@/lib/work/server";
import { canTransition, taskCode, STATUS_LABEL } from "@/lib/work/model";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["publish", "accept", "block", "resume", "submit_review", "complete", "cancel", "reopen", "archive", "override_dependency"]),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/admin/work/tasks/:id/action — the task lifecycle.
 *   accept               assignee/collaborator: records acceptance + start;
 *                        the task goes ASSIGNED → IN_PROGRESS (unless it is
 *                        waiting on another task)
 *   block / resume       doers or managers (block needs a reason)
 *   submit_review        doers: hand the whole task in
 *   complete             reviewer / manager with review rights
 *   cancel / reopen      managers, with a reason
 *   publish              managers: a DRAFT goes out to its assignees
 *   archive              managers, closed tasks only
 *   override_dependency  managers, with a reason
 * The status write is a compare-and-set on the status read, so two people
 * acting at once can't both move it.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  const { task, caps, member } = found;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Unknown action.");
  const { action, reason } = parsed.data;
  const code = taskCode(task.number);
  const doer = caps.memberRole === "ASSIGNEE" || caps.memberRole === "COLLABORATOR";

  const managersOf = async () => {
    const reviewers = await prisma.workTaskMember.findMany({ where: { taskId: id, role: "REVIEWER" }, select: { userId: true } });
    return [task.createdById, task.managerId, ...reviewers.map((r) => r.userId)].filter((u): u is string => !!u && u !== a.userId);
  };
  const doersOf = async () =>
    (await prisma.workTaskMember.findMany({ where: { taskId: id, role: { in: ["ASSIGNEE", "COLLABORATOR"] } }, select: { userId: true } }))
      .map((m) => m.userId)
      .filter((u) => u !== a.userId);

  const move = async (to: string, extra: Record<string, unknown> = {}) => {
    if (!canTransition(task.status, to)) {
      return bad(`A task that is ${STATUS_LABEL[task.status] ?? task.status} can't become ${STATUS_LABEL[to] ?? to}.`, 409);
    }
    const r = await prisma.workTask.updateMany({ where: { id, status: task.status }, data: { status: to, ...extra } });
    if (r.count === 0) return bad("The task changed meanwhile — reload and try again.", 409);
    return null;
  };

  if (action === "accept") {
    if (!doer) return bad("Only the people assigned can accept this task.", 403);
    if (task.status === "DRAFT") return bad("This task hasn't been published yet.", 409);
    if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(task.status)) return bad("This task is closed.", 409);
    const now = new Date();
    await prisma.workTaskMember.updateMany({
      where: { taskId: id, userId: a.userId, acceptedAt: null },
      data: { acceptedAt: now, startedAt: now },
    });
    let waiting = false;
    if (task.status === "ASSIGNED") {
      const dep = task.dependsOnId
        ? await prisma.workTask.findUnique({ where: { id: task.dependsOnId }, select: { status: true } })
        : null;
      waiting = !!dep && dep.status !== "COMPLETED";
      if (!waiting) await prisma.workTask.updateMany({ where: { id, status: "ASSIGNED" }, data: { status: "IN_PROGRESS" } });
    }
    if (!member?.acceptedAt) {
      await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "ACCEPTED", summary: "Accepted and started the task" });
      await notifyWork(await managersOf(), { title: `${code} accepted`, message: task.title, taskId: id });
    }
    return NextResponse.json({ ok: true, waiting });
  }

  if (action === "block") {
    if (!doer && !caps.manage) return bad("You can't change this task.", 403);
    if (!reason) return bad("Say what is blocking the work.");
    const err = await move("BLOCKED");
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "BLOCKED", summary: `Blocked — ${reason}` });
    await notifyWork(await managersOf(), { title: `${code} is blocked`, message: reason, taskId: id });
    return NextResponse.json({ ok: true });
  }

  if (action === "resume") {
    if (!doer && !caps.manage) return bad("You can't change this task.", 403);
    const err = await move("IN_PROGRESS");
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "RESUMED", summary: `Resumed${reason ? ` — ${reason}` : ""}` });
    return NextResponse.json({ ok: true });
  }

  if (action === "submit_review") {
    if (!doer) return bad("Only the people doing the task can submit it.", 403);
    const err = await move("IN_REVIEW");
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "SUBMITTED_FOR_REVIEW", summary: `Submitted for final review${reason ? ` — ${reason}` : ""}` });
    await notifyWork(await managersOf(), { title: `${code} is ready for review`, message: task.title, taskId: id });
    return NextResponse.json({ ok: true });
  }

  if (action === "complete") {
    if (!caps.review) return bad("Only a reviewer or manager of this task can complete it.", 403);
    const pending = await prisma.workReport.count({ where: { taskId: id, status: "SUBMITTED" } });
    if (pending) return bad(`Review the ${pending} report(s) still waiting first.`, 409);
    const err = await move("COMPLETED", { completedAt: new Date(), closedReason: reason || null });
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "COMPLETED", summary: `Approved as completed${reason ? ` — ${reason}` : ""}` });
    await notifyWork(await doersOf(), { title: `${code} completed`, message: "Final completion approved.", taskId: id });
    await writeAudit({ actorId: a.userId, action: "WORK_TASK_COMPLETED", entity: "WorkTask", entityId: id, summary: `Completed ${code}` });
    // A repeating task opens its next occurrence.
    const nextId = task.recurrence !== "NONE" ? await createNextOccurrence(id, a.userId) : null;
    return NextResponse.json({ ok: true, nextId });
  }

  if (!caps.manage) return bad("Only the task's managers can do that.", 403);

  if (action === "cancel" || action === "reopen") {
    if (!reason) return bad(action === "cancel" ? "Say why the task is cancelled." : "Say why the task is reopened.");
    const to = action === "cancel" ? "CANCELLED" : task.status === "CANCELLED" ? "ASSIGNED" : "IN_PROGRESS";
    const err = await move(to, action === "cancel" ? { closedReason: reason } : { completedAt: null, closedReason: null });
    if (err) return err;
    await logWorkActivity({
      taskId: id,
      projectId: task.projectId,
      actorId: a.userId,
      type: action === "cancel" ? "CANCELLED" : "REOPENED",
      summary: `${action === "cancel" ? "Cancelled" : "Reopened"} — ${reason}`,
    });
    // A withdrawn task stops asking anyone to accept it (the pop-up reads open tasks only).
    await notifyWork(await doersOf(), { title: `${code} ${action === "cancel" ? "cancelled" : "reopened"}`, message: reason, taskId: id });
    await writeAudit({ actorId: a.userId, action: action === "cancel" ? "WORK_TASK_CANCELLED" : "WORK_TASK_REOPENED", entity: "WorkTask", entityId: id, summary: `${code}: ${reason}` });
    return NextResponse.json({ ok: true });
  }

  if (action === "publish") {
    const doers = await prisma.workTaskMember.findMany({ where: { taskId: id, role: { in: ["ASSIGNEE", "COLLABORATOR"] } }, select: { userId: true, role: true } });
    if (!doers.some((m) => m.role === "ASSIGNEE")) return bad("Add at least one assignee before publishing.");
    const err = await move("ASSIGNED");
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "PUBLISHED", summary: `Published and assigned ${code}` });
    await notifyWork(doers.map((m) => m.userId).filter((u) => u !== a.userId), {
      title: `New task: ${code}`,
      message: `${task.title} — open it and press Accept & Start.`,
      taskId: id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "archive") {
    const err = await move("ARCHIVED");
    if (err) return err;
    await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "ARCHIVED", summary: "Archived" });
    return NextResponse.json({ ok: true });
  }

  // override_dependency
  if (!task.dependsOnId) return bad("This task doesn't wait on another task.");
  if (!reason) return bad("Say why the dependency is overridden.");
  await prisma.workTask.update({ where: { id }, data: { dependsOnId: null } });
  if (task.status === "ASSIGNED") {
    const accepted = await prisma.workTaskMember.count({ where: { taskId: id, acceptedAt: { not: null } } });
    if (accepted) await prisma.workTask.updateMany({ where: { id, status: "ASSIGNED" }, data: { status: "IN_PROGRESS" } });
  }
  await logWorkActivity({ taskId: id, projectId: task.projectId, actorId: a.userId, type: "DEPENDENCY_OVERRIDDEN", summary: `Dependency overridden — ${reason}` });
  return NextResponse.json({ ok: true });
}
