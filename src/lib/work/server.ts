import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { loadWorkActor, type WorkActor } from "@/lib/work/access";
import { overallPercent, targetProgress, type TargetProgress } from "@/lib/work/model";

/** Every Team Work API starts here: signed in, staff, work.view. */
export async function workGuard(): Promise<{ actor: WorkActor } | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const actor = await loadWorkActor(session.user.id);
  if (!actor) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { actor };
}

/** The same 404 for "missing" and "not yours", so task ids can't be probed. */
export const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Progress for a set of tasks, from report lines — APPROVED counts, SUBMITTED
 * is shown apart. Nothing is stored twice: this is the only source.
 */
export async function progressForTasks(taskIds: string[]) {
  const out = new Map<string, { targets: TargetProgress[]; overall: number }>();
  if (taskIds.length === 0) return out;
  const targets = await prisma.workTarget.findMany({
    where: { taskId: { in: taskIds } },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
  const ids = targets.map((t) => t.id);
  const [approved, pending] = ids.length
    ? await Promise.all([
        prisma.workReportLine.groupBy({
          by: ["targetId"],
          where: { targetId: { in: ids }, report: { status: "APPROVED" } },
          _sum: { quantity: true },
        }),
        prisma.workReportLine.groupBy({
          by: ["targetId"],
          where: { targetId: { in: ids }, report: { status: "SUBMITTED" } },
          _sum: { quantity: true },
        }),
      ])
    : [[], []];
  const a = new Map((approved as Array<{ targetId: string; _sum: { quantity: number | null } }>).map((r) => [r.targetId, r._sum.quantity ?? 0]));
  const p = new Map((pending as Array<{ targetId: string; _sum: { quantity: number | null } }>).map((r) => [r.targetId, r._sum.quantity ?? 0]));
  for (const id of taskIds) out.set(id, { targets: [], overall: 0 });
  for (const t of targets) out.get(t.taskId)!.targets.push(targetProgress(t, a.get(t.id) ?? 0, p.get(t.id) ?? 0));
  for (const v of out.values()) v.overall = overallPercent(v.targets);
  return out;
}

export async function logWorkActivity(opts: {
  taskId?: string | null;
  projectId?: string | null;
  actorId: string | null;
  type: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.workActivity
    .create({
      data: {
        taskId: opts.taskId ?? null,
        projectId: opts.projectId ?? null,
        actorId: opts.actorId,
        type: opts.type,
        summary: opts.summary.slice(0, 500),
        meta: (opts.meta ?? undefined) as object | undefined,
      },
    })
    .catch(() => {});
}

/**
 * Bell + push for Team Work events. Only ever sent to people on the task (or
 * its managers) — the caller passes who; a notification never reaches anyone
 * who cannot open the task it names. No email: these are internal.
 */
export async function notifyWork(userIds: string[], opts: { title: string; message: string; taskId?: string; link?: string }) {
  const link = opts.link ?? (opts.taskId ? `/admin/work/tasks/${opts.taskId}` : "/admin/work");
  await Promise.all(
    [...new Set(userIds)].map((userId) =>
      notifyUser({
        userId,
        title: opts.title.slice(0, 120),
        message: opts.message.slice(0, 300),
        link,
        data: { work: true, ...(opts.taskId ? { taskId: opts.taskId } : {}) },
        email: false,
      }).catch(() => {})
    )
  );
}

/** Names for a set of user ids (staff pickers, member lists). */
export async function userNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, { id: string; name: string; avatar: string | null }>();
  const rows = await prisma.user.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, username: true, email: true, avatar: true },
  });
  return new Map(rows.map((u) => [u.id, { id: u.id, name: u.name || u.username || u.email, avatar: u.avatar }]));
}
