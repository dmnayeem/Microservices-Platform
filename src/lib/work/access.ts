import "server-only";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import { isStaffRole } from "@/lib/staff";
import type { Permission } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { OPEN_TASK_STATUSES, type MemberRole } from "@/lib/work/model";

/**
 * Team Work access — the ONE place that decides who may see and do what.
 *
 * There is no row-level security in this database (Prisma through Accelerate,
 * not Supabase), so this is the enforcement point: every list, count, search,
 * dashboard and notification query takes `visibleTaskWhere(actor)`, and every
 * single-task API takes `loadTaskFor()`. Nothing filters on the client.
 *
 * The five separate questions:
 *   assigned?  — WorkTaskMember role ASSIGNEE (does the work)
 *   visible?   — creator, manager, any member, the team (visibility TEAM),
 *                all staff (visibility ALL_STAFF), or work.oversee
 *   manage?    — creator, manager, a Lead of the task's team (with
 *                work.create), or work.oversee
 *   report?    — ASSIGNEE or COLLABORATOR, while the task is open
 *   review?    — REVIEWER member, or a manager holding work.review
 *
 * A broad admin role does NOT imply seeing private tasks: only work.oversee
 * does, which only the super admin has by default (MANAGER is excluded in
 * rbac.ts) and is granted to a person deliberately.
 */

export interface WorkActor {
  userId: string;
  role: string;
  perms: Set<Permission>;
  isSuper: boolean;
  /** Reads every task, private ones included. */
  oversee: boolean;
  teamIds: string[];
  leadTeamIds: string[];
}

/** null = not staff, inactive, or no work.view — Team Work does not exist for them. */
export async function loadWorkActor(userId: string): Promise<WorkActor | null> {
  const [user, perms, teams] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } }),
    getEffectivePermissions(userId).catch(() => new Set<Permission>()),
    prisma.workTeamMember.findMany({
      where: { userId, team: { isActive: true } },
      select: { teamId: true, isLead: true },
    }),
  ]);
  if (!user || user.status === "BANNED" || user.status === "SUSPENDED") return null;
  if (!isStaffRole(user.role)) return null;
  if (!perms.has("work.view")) return null;
  const isSuper = user.role === "SUPER_ADMIN";
  return {
    userId,
    role: user.role,
    perms,
    isSuper,
    oversee: isSuper || perms.has("work.oversee"),
    teamIds: teams.map((t) => t.teamId),
    leadTeamIds: teams.filter((t) => t.isLead).map((t) => t.teamId),
  };
}

/** The Prisma filter for "tasks this person may see". Use it on EVERY task query. */
export function visibleTaskWhere(a: WorkActor): Prisma.WorkTaskWhereInput {
  if (a.oversee) return {};
  return {
    AND: [
      {
        OR: [
          { createdById: a.userId },
          { managerId: a.userId },
          { members: { some: { userId: a.userId } } },
          { visibility: "ALL_STAFF" },
          ...(a.teamIds.length ? [{ visibility: "TEAM", teamId: { in: a.teamIds } }] : []),
          // A Team Lead sees the work of the team they lead.
          ...(a.leadTeamIds.length ? [{ teamId: { in: a.leadTeamIds } }] : []),
        ],
      },
      // A draft is its author's (and manager's) only.
      { OR: [{ status: { not: "DRAFT" } }, { createdById: a.userId }, { managerId: a.userId }] },
    ],
  };
}

export interface TaskCaps {
  view: boolean;
  manage: boolean;
  report: boolean;
  review: boolean;
  /** Read and write private management notes. */
  privateNotes: boolean;
  memberRole: MemberRole | null;
}

type TaskShape = { createdById: string; managerId: string | null; teamId: string | null; visibility: string; status: string };

export function taskCaps(a: WorkActor, t: TaskShape, memberRole: MemberRole | null): TaskCaps {
  const leadOfTeam = !!t.teamId && a.leadTeamIds.includes(t.teamId) && a.perms.has("work.create");
  const manage = a.oversee || t.createdById === a.userId || t.managerId === a.userId || leadOfTeam;
  const draftHidden = t.status === "DRAFT" && !(t.createdById === a.userId || t.managerId === a.userId || a.oversee);
  const view =
    !draftHidden &&
    (manage ||
      memberRole !== null ||
      t.visibility === "ALL_STAFF" ||
      (t.visibility === "TEAM" && !!t.teamId && a.teamIds.includes(t.teamId)) ||
      (!!t.teamId && a.leadTeamIds.includes(t.teamId)));
  const open = (OPEN_TASK_STATUSES as string[]).includes(t.status);
  return {
    view,
    manage,
    report: view && open && (memberRole === "ASSIGNEE" || memberRole === "COLLABORATOR"),
    review: view && (memberRole === "REVIEWER" || a.isSuper || (manage && a.perms.has("work.review"))),
    privateNotes: manage,
    memberRole,
  };
}

/**
 * One task, only if this person may see it. Not found and not allowed return
 * the same null, so a task id cannot be probed.
 */
export async function loadTaskFor(a: WorkActor, taskId: string) {
  if (!taskId || taskId.length > 64) return null;
  const task = await prisma.workTask.findFirst({
    where: { AND: [{ id: taskId }, visibleTaskWhere(a)] },
  });
  if (!task) return null;
  const member = await prisma.workTaskMember.findUnique({
    where: { taskId_userId: { taskId, userId: a.userId } },
    select: { role: true, acceptedAt: true, startedAt: true },
  });
  const caps = taskCaps(a, task, (member?.role as MemberRole) ?? null);
  if (!caps.view) return null;
  return { task, member, caps };
}

/**
 * May this person assign work to these people (and file it under this team)?
 * With work.assign_any (or oversight): anyone on the staff. Otherwise only
 * members of teams they LEAD, and only under one of those teams.
 */
export async function assignmentProblem(
  a: WorkActor,
  userIds: string[],
  teamId: string | null
): Promise<string | null> {
  if (!a.perms.has("work.create") && !a.oversee) return "You can't create or assign work.";
  const ids = [...new Set(userIds)];
  const staff = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, status: true } })
    : [];
  if (staff.length !== ids.length || staff.some((u) => !isStaffRole(u.role))) {
    return "Work can only be assigned to staff accounts.";
  }
  if (staff.some((u) => u.status === "BANNED" || u.status === "SUSPENDED")) {
    return "One of the people chosen is suspended or banned.";
  }
  if (a.oversee || a.perms.has("work.assign_any")) return null;

  if (!teamId || !a.leadTeamIds.includes(teamId)) {
    return "Choose one of the teams you lead — assigning outside them needs \"Assign across teams\".";
  }
  const others = ids.filter((id) => id !== a.userId);
  if (others.length) {
    const inTeam = await prisma.workTeamMember.count({ where: { teamId, userId: { in: others } } });
    if (inTeam !== others.length) {
      return "You can only assign people from the team you lead.";
    }
  }
  return null;
}
