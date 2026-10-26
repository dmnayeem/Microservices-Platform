import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { writeAudit } from "@/lib/audit";
import { visibleTaskWhere } from "@/lib/work/access";
import { visibleProjectWhere } from "@/lib/work/projects";
import { bad, logWorkActivity, progressForTasks, userNames, workGuard } from "@/lib/work/server";
import { OPEN_TASK_STATUSES, PROJECT_STATUSES, WORK_PRIORITIES, projectCode } from "@/lib/work/model";

/** GET — projects this person can see, with progress over the tasks THEY can see. */
export async function GET(req: NextRequest) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const status = req.nextUrl.searchParams.get("status");
  const projects = await prisma.workProject.findMany({
    where: {
      AND: [
        visibleProjectWhere(a),
        status && (PROJECT_STATUSES as readonly string[]).includes(status) ? { status } : { status: { not: "ARCHIVED" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const ids = projects.map((p) => p.id);
  const tasks = ids.length
    ? await prisma.workTask.findMany({
        where: { AND: [visibleTaskWhere(a), { projectId: { in: ids } }, { status: { not: "ARCHIVED" } }] },
        select: { id: true, projectId: true, status: true, dueAt: true },
      })
    : [];
  const progress = await progressForTasks(tasks.map((t) => t.id));
  const names = await userNames(projects.map((p) => p.leadId ?? ""));
  const now = Date.now();

  return NextResponse.json({
    projects: projects.map((p) => {
      const mine = tasks.filter((t) => t.projectId === p.id && t.status !== "CANCELLED");
      const pct = mine.length ? Math.floor(mine.reduce((s, t) => s + (progress.get(t.id)?.overall ?? 0), 0) / mine.length) : 0;
      return {
        ...p,
        code: projectCode(p.number),
        lead: p.leadId ? names.get(p.leadId) ?? null : null,
        tasks: mine.length,
        completed: mine.filter((t) => t.status === "COMPLETED").length,
        overdue: mine.filter((t) => (OPEN_TASK_STATUSES as string[]).includes(t.status) && t.dueAt && t.dueAt.getTime() < now).length,
        percent: pct,
        // When the viewer can't see every task, the figures say so.
        partial: !a.oversee,
      };
    }),
  });
}

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(100_000).nullish(),
  teamId: z.string().min(1).max(64).nullish(),
  leadId: z.string().min(1).max(64).nullish(),
  priority: z.enum(WORK_PRIORITIES).default("NORMAL"),
  startAt: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
});

/** POST — create a project (work.create; a non-"across teams" creator files it under a team they lead). */
export async function POST(req: NextRequest) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  if (!a.oversee && !a.perms.has("work.create")) return bad("You can't create projects.", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid project");
  const b = parsed.data;
  if (!a.oversee && !a.perms.has("work.assign_any") && (!b.teamId || !a.leadTeamIds.includes(b.teamId))) {
    return bad("Choose one of the teams you lead.", 403);
  }
  if (b.startAt && b.dueAt && b.dueAt < b.startAt) return bad("The due date is before the start date.");
  const p = await prisma.workProject.create({
    data: {
      title: b.title,
      description: b.description ? sanitizeRichHtml(b.description) : null,
      teamId: b.teamId || null,
      leadId: b.leadId || null,
      createdById: a.userId,
      priority: b.priority,
      startAt: b.startAt ?? null,
      dueAt: b.dueAt ?? null,
    },
  });
  await logWorkActivity({ projectId: p.id, actorId: a.userId, type: "PROJECT_CREATED", summary: `Created ${projectCode(p.number)}` });
  await writeAudit({ actorId: a.userId, action: "WORK_PROJECT_CREATED", entity: "WorkProject", entityId: p.id, summary: `Created project ${projectCode(p.number)}` });
  return NextResponse.json({ ok: true, id: p.id }, { status: 201 });
}
