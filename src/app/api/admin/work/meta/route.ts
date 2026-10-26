import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLES, STAFF_WHERE } from "@/lib/staff";
import { visibleTaskWhere } from "@/lib/work/access";
import { visibleProjectWhere } from "@/lib/work/projects";
import { workGuard } from "@/lib/work/server";
import { OPEN_TASK_STATUSES, projectCode, taskCode } from "@/lib/work/model";

/**
 * GET /api/admin/work/meta — what the Team Work forms need: the admin-managed
 * lists, teams, projects + milestones this person can see, and — only for
 * someone who may assign work — the people they may assign it to (everyone
 * on the staff with "Assign across teams", else the teams they lead).
 */
export async function GET() {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const canCreate = a.oversee || a.perms.has("work.create");
  const assignAny = a.oversee || a.perms.has("work.assign_any");

  const [options, teams, projects] = await Promise.all([
    prisma.workOption.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { sort: "asc" }, { label: "asc" }] }),
    prisma.workTeam.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
    prisma.workProject.findMany({
      where: { AND: [visibleProjectWhere(a), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, number: true, title: true, milestones: { select: { id: true, title: true, status: true }, orderBy: { sort: "asc" } } },
    }),
  ]);

  let people: Array<{ id: string; name: string; role: string; teamIds: string[] }> = [];
  if (canCreate) {
    const memberWhere = assignAny ? {} : { teamId: { in: a.leadTeamIds } };
    const memberships = await prisma.workTeamMember.findMany({ where: memberWhere, select: { userId: true, teamId: true } });
    const ids = assignAny ? undefined : [...new Set([...memberships.map((m) => m.userId), a.userId])];
    const users = await prisma.user.findMany({
      where: { ...STAFF_WHERE, status: { notIn: ["BANNED", "SUSPENDED"] }, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, name: true, username: true, email: true, role: true },
    });
    const teamsOf = new Map<string, string[]>();
    for (const m of memberships) teamsOf.set(m.userId, [...(teamsOf.get(m.userId) ?? []), m.teamId]);
    people = users.map((u) => ({ id: u.id, name: u.name || u.username || u.email, role: u.role, teamIds: teamsOf.get(u.id) ?? [] }));
  }

  // For "depends on": open tasks this person can see.
  const openTasks = canCreate
    ? await prisma.workTask.findMany({
        where: { AND: [visibleTaskWhere(a), { status: { in: OPEN_TASK_STATUSES } }] },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, number: true, title: true },
      })
    : [];

  const rows = projects as unknown as Array<{ id: string; number: number; title: string; milestones: { id: string; title: string; status: string }[] }>;
  return NextResponse.json({
    me: { userId: a.userId, isSuper: a.isSuper, teamIds: a.teamIds, leadTeamIds: a.leadTeamIds },
    caps: {
      create: canCreate,
      assignAny,
      oversee: a.oversee,
      review: a.perms.has("work.review") || a.isSuper,
      settings: a.perms.has("work.settings"),
    },
    options: {
      DEPARTMENT: options.filter((o) => o.kind === "DEPARTMENT"),
      CATEGORY: options.filter((o) => o.kind === "CATEGORY"),
      PLATFORM: options.filter((o) => o.kind === "PLATFORM"),
      UNIT: options.filter((o) => o.kind === "UNIT"),
      POSITION: options.filter((o) => o.kind === "POSITION"),
    },
    teams: teams.map((t) => ({ ...t, lead: a.leadTeamIds.includes(t.id), member: a.teamIds.includes(t.id) })),
    projects: rows.map((p) => ({ id: p.id, code: projectCode(p.number), title: p.title, milestones: p.milestones })),
    people,
    tasks: openTasks.map((x) => ({ id: x.id, code: taskCode(x.number), title: x.title })),
    staffRoles: STAFF_ROLES,
  });
}
