import type { Prisma } from "@/generated/prisma/client";
import { isStaffRole } from "@/lib/staff";

/**
 * The super admin's private member tasks — ONE definition, used by every
 * admin screen and member route that reads tasks.
 *
 *   Task.superAdminOnly  in the admin panel only a SUPER_ADMIN sees it: task
 *                        lists, detail, edit, duplicate, submissions, review,
 *                        analytics, exports. Totals (counts, money) still
 *                        include it — the books must add up — but no title
 *                        or detail reaches anyone else.
 *   Task.allowedUserIds  on the member side only these users get it.
 *                        Empty = no restriction (the audience/level/plan rules
 *                        decide, as before).
 *
 * A private task is also kept off staff accounts on the member side unless
 * they are selected — otherwise any admin could find it by browsing the site.
 *
 * Only a SUPER_ADMIN can set either field (task create/edit APIs).
 */

/** Admin-panel task filter: AND it into every admin query that shows task titles or details. */
export function adminTaskScope(role: string | null | undefined): { superAdminOnly?: false } {
  // Narrow on purpose: it also spreads into findUnique({ where: { id, ... } }).
  return role === "SUPER_ADMIN" ? {} : { superAdminOnly: false };
}

/** Same, for submission queries (through their task). */
export function adminSubmissionScope(role: string | null | undefined): Prisma.TaskSubmissionWhereInput {
  return role === "SUPER_ADMIN" ? {} : { task: { superAdminOnly: false } };
}

/** May this admin see this task row? (single-row reads) */
export function adminCanSeeTask(role: string | null | undefined, task: { superAdminOnly?: boolean | null }): boolean {
  return role === "SUPER_ADMIN" || !task.superAdminOnly;
}

type Viewer = { id?: string | null; role?: string | null };

/** Member-side filter (inside visibleTaskWhere): selected members, and private tasks off staff. */
export function memberTaskPrivacyWhere(viewer: Viewer): Prisma.TaskWhereInput[] {
  const id = viewer.id ?? null;
  const clauses: Prisma.TaskWhereInput[] = [
    id ? { OR: [{ allowedUserIds: { isEmpty: true } }, { allowedUserIds: { has: id } }] } : { allowedUserIds: { isEmpty: true } },
  ];
  if (isStaffRole(viewer.role) && viewer.role !== "SUPER_ADMIN") {
    clauses.push({ OR: [{ superAdminOnly: false }, ...(id ? [{ allowedUserIds: { has: id } }] : [])] });
  }
  return clauses;
}

/** Member-side per-row check (opening, starting or submitting one task by id). */
export function memberCanSeeTask(
  task: { allowedUserIds?: string[] | null; superAdminOnly?: boolean | null },
  viewer: Viewer
): boolean {
  // The super admin makes these tasks, so may always open one by id (preview,
  // checking what members see) — the feed list still shows them only their own.
  if (viewer.role === "SUPER_ADMIN") return true;
  const allowed = task.allowedUserIds ?? [];
  const selected = !!viewer.id && allowed.includes(viewer.id);
  if (allowed.length > 0 && !selected) return false;
  if (task.superAdminOnly && isStaffRole(viewer.role) && viewer.role !== "SUPER_ADMIN" && !selected) return false;
  return true;
}

/** A task's name for text other admins may read (transactions, audit logs, broadcasts). */
export function taskNameForLog(task: { title: string; superAdminOnly?: boolean | null }): string {
  return task.superAdminOnly ? "a private task" : task.title;
}
