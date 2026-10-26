import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { visibleTaskWhere, type WorkActor } from "@/lib/work/access";

/**
 * Projects a person may see: oversight; or they created / lead it, are on its
 * team, or can see at least one of its tasks. Inside a project they still see
 * only the tasks visibleTaskWhere() lets through — and its counts are counted
 * over those tasks, so a project never reveals a private task by its numbers.
 */
export function visibleProjectWhere(a: WorkActor): Prisma.WorkProjectWhereInput {
  if (a.oversee) return {};
  return {
    OR: [
      { createdById: a.userId },
      { leadId: a.userId },
      ...(a.teamIds.length ? [{ teamId: { in: a.teamIds } }] : []),
      { tasks: { some: visibleTaskWhere(a) } },
    ],
  };
}

/** May this person change the project (title, milestones, status)? */
export function canManageProject(a: WorkActor, p: { createdById: string; leadId: string | null; teamId: string | null }): boolean {
  return (
    a.oversee ||
    p.createdById === a.userId ||
    p.leadId === a.userId ||
    (!!p.teamId && a.leadTeamIds.includes(p.teamId) && a.perms.has("work.create"))
  );
}
